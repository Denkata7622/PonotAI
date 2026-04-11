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
    const token = await createUser(baseUrl, "feature");

    const playlistRes = await fetch(`${baseUrl}/api/playlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Road Trip" }),
    });
    const playlist = (await playlistRes.json()) as { id: string };

    await fetch(`${baseUrl}/api/playlists/${playlist.id}/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "Numb", artist: "Linkin Park" }),
    });

    const shareRes = await fetch(`${baseUrl}/api/share/playlist/${playlist.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (shareRes.status !== 201) throw new Error(`Expected 201 share playlist, got ${shareRes.status}`);
    const sharePayload = (await shareRes.json()) as { shareCode: string };

    const sharedRead = await fetch(`${baseUrl}/api/share/${sharePayload.shareCode}`);
    const sharedBody = (await sharedRead.json()) as { type: string; songs?: unknown[] };
    if (sharedBody.type !== "playlist") throw new Error("Expected shared playlist payload type");
    if (!Array.isArray(sharedBody.songs) || sharedBody.songs.length === 0) throw new Error("Expected playlist songs in shared response");

    const achievementsRes = await fetch(`${baseUrl}/api/achievements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const achievementsPayload = (await achievementsRes.json()) as { items: Array<{ key: string }> };
    if (!achievementsPayload.items.some((item) => item.key === "first_playlist")) {
      throw new Error("Expected first_playlist achievement");
    }

    console.log("feature-expansion.test.ts passed");
  } finally {
    server.close();
  }
}

void run();
