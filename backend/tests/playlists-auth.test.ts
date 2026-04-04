import app from "../src/app";

async function createUser(baseUrl: string, name: string) {
  const email = `${name}-${Date.now()}@test.dev`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `${name}${Date.now().toString().slice(-4)}`, email, password: "password123" }),
  });
  const data = (await response.json()) as { token: string };
  return data.token;
}

async function run() {
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to start test server");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const userAToken = await createUser(baseUrl, "playlista");
    const userBToken = await createUser(baseUrl, "playlistb");

    const createRes = await fetch(`${baseUrl}/api/playlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ name: "Private Mix" }),
    });
    const created = (await createRes.json()) as { id: string };

    const readByB = await fetch(`${baseUrl}/api/playlists/${created.id}`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    if (readByB.status !== 404) throw new Error(`Expected 404, got ${readByB.status}`);

    const editByB = await fetch(`${baseUrl}/api/playlists/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userBToken}` },
      body: JSON.stringify({ name: "Hacked" }),
    });
    if (editByB.status !== 403) throw new Error(`Expected 403, got ${editByB.status}`);

    const deleteByB = await fetch(`${baseUrl}/api/playlists/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    if (deleteByB.status !== 403) throw new Error(`Expected 403, got ${deleteByB.status}`);

    const unauthStatuses = await Promise.all([
      fetch(`${baseUrl}/api/playlists`),
      fetch(`${baseUrl}/api/playlists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x" }) }),
      fetch(`${baseUrl}/api/playlists/${created.id}`),
      fetch(`${baseUrl}/api/playlists/${created.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x" }) }),
      fetch(`${baseUrl}/api/playlists/${created.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x" }) }),
      fetch(`${baseUrl}/api/playlists/${created.id}`, { method: "DELETE" }),
      fetch(`${baseUrl}/api/playlists/${created.id}/songs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "a", artist: "b" }) }),
    ]);

    if (!unauthStatuses.every((res) => res.status === 401)) {
      throw new Error(`Expected all unauth routes to return 401. Got: ${unauthStatuses.map((res) => res.status).join(", ")}`);
    }

    console.log("playlists-auth.test.ts passed");
  } finally {
    server.close();
  }
}

void run();
