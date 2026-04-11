import crypto from "node:crypto";
import {
  createFavorite,
  createPlaylist,
  createUser,
  createUserHistory,
  findUserByEmail,
  type PlaylistSongRecord,
} from "../../db/authStore";

const personas = {
  gym: {
    usernamePrefix: "GymPulse",
    tracks: [
      { title: "Lose Yourself", artist: "Eminem" },
      { title: "Can’t Hold Us", artist: "Macklemore & Ryan Lewis" },
      { title: "Stronger", artist: "Kanye West" },
    ],
  },
  indie: {
    usernamePrefix: "IndieExplorer",
    tracks: [
      { title: "505", artist: "Arctic Monkeys" },
      { title: "Space Song", artist: "Beach House" },
      { title: "Cherry Wine", artist: "Hozier" },
    ],
  },
  nostalgia: {
    usernamePrefix: "RetroWave",
    tracks: [
      { title: "Billie Jean", artist: "Michael Jackson" },
      { title: "Take On Me", artist: "a-ha" },
      { title: "Like a Prayer", artist: "Madonna" },
    ],
  },
} as const;

export type DemoPersona = keyof typeof personas;

function shiftDays(date: Date, days: number): string {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy.toISOString();
}

export async function generateDemoAccount(persona: DemoPersona = "gym") {
  const template = personas[persona] ?? personas.gym;
  const suffix = Math.floor(Math.random() * 10000);
  const username = `${template.usernamePrefix}${suffix}`;
  const email = `${username.toLowerCase()}@demo.trackly.local`;

  if (await findUserByEmail(email)) {
    return generateDemoAccount(persona);
  }

  const passwordHash = crypto.createHash("sha256").update(`demo-${username}`).digest("hex");
  const user = await createUser({ username, email, passwordHash, role: "user", isDemo: true });

  const playlistSongs: PlaylistSongRecord[] = template.tracks.map((track) => ({ ...track, album: "Demo Collection" }));
  await createPlaylist(user.id, `${template.usernamePrefix} Mix`, undefined, playlistSongs);

  for (let i = 0; i < template.tracks.length; i += 1) {
    const track = template.tracks[i];
    await createFavorite({ userId: user.id, title: track.title, artist: track.artist, album: "Demo Collection" });
    await createUserHistory({
      userId: user.id,
      method: i % 2 === 0 ? "audio-file" : "image-upload",
      title: track.title,
      artist: track.artist,
      album: "Demo Collection",
      recognized: true,
    });
  }

  for (let day = 0; day < 7; day += 1) {
    const track = template.tracks[day % template.tracks.length];
    await createUserHistory({
      userId: user.id,
      method: "demo-seed",
      title: track.title,
      artist: track.artist,
      album: "Demo Collection",
      recognized: true,
    });
  }

  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    persona,
    note: "Demo account generated with seeded listening history and playlists.",
  };
}
