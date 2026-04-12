import crypto from "node:crypto";
import {
  createFavorite,
  createPlaylist,
  createUser,
  createUserHistory,
  findUserByEmail,
  type PlaylistSongRecord,
} from "../../db/authStore";
import { hashPassword } from "../auth/password";

type PersonaTrack = { title: string; artist: string; album?: string; genre: string };

type PersonaTemplate = {
  usernamePrefix: string;
  description: string;
  activityBias: "morning" | "afternoon" | "evening";
  tracks: PersonaTrack[];
  playlistNames: string[];
};

const covers = [
  "https://picsum.photos/seed/trackly-01/320/320",
  "https://picsum.photos/seed/trackly-02/320/320",
  "https://picsum.photos/seed/trackly-03/320/320",
  "https://picsum.photos/seed/trackly-04/320/320",
  "https://picsum.photos/seed/trackly-05/320/320",
  "https://picsum.photos/seed/trackly-06/320/320",
  "https://picsum.photos/seed/trackly-07/320/320",
  "https://picsum.photos/seed/trackly-08/320/320",
];

function buildTracks(seed: Array<{ artist: string; baseTitle: string; genre: string }>): PersonaTrack[] {
  const result: PersonaTrack[] = [];
  for (const template of seed) {
    for (let i = 1; i <= 20; i += 1) {
      result.push({
        title: `${template.baseTitle} ${i}`,
        artist: template.artist,
        album: `${template.genre.toUpperCase()} Sessions`,
        genre: template.genre,
      });
    }
  }
  return result;
}

const personas: Record<string, PersonaTemplate> = {
  gym: {
    usernamePrefix: "GymPulse",
    description: "High-energy listener with hard-hitting workout cycles and repeat motivation tracks.",
    activityBias: "morning",
    tracks: buildTracks([
      { artist: "Iron Drive", baseTitle: "Power Sprint", genre: "rock" },
      { artist: "Voltage Crew", baseTitle: "Cardio Lift", genre: "hip-hop" },
      { artist: "Neon Rush", baseTitle: "Final Set", genre: "electronic" },
      { artist: "Steel Hearts", baseTitle: "Peak Reps", genre: "rock" },
      { artist: "Runline", baseTitle: "Pace Control", genre: "edm" },
    ]),
    playlistNames: ["PR Day", "Morning Warmup", "HIIT Zone", "Leg Day Heat"],
  },
  indie: {
    usernamePrefix: "IndieExplorer",
    description: "Discovery-focused listener rotating indie, alt-pop, and low-key hidden gems.",
    activityBias: "evening",
    tracks: buildTracks([
      { artist: "North Arcade", baseTitle: "City Window", genre: "indie" },
      { artist: "Honey Pines", baseTitle: "Soft Echo", genre: "indie" },
      { artist: "Moss Avenue", baseTitle: "Late Bus", genre: "alt" },
      { artist: "Velvet Orbit", baseTitle: "Shimmer Lines", genre: "dream pop" },
      { artist: "Quiet Cinema", baseTitle: "Storyboard", genre: "indie" },
    ]),
    playlistNames: ["Fresh Finds", "Late Night Indie", "Cloud Walk", "Quiet Coffee"],
  },
  nostalgia: {
    usernamePrefix: "RetroWave",
    description: "2000s and throwback pop listener with familiar hooks and singalong-heavy habits.",
    activityBias: "afternoon",
    tracks: buildTracks([
      { artist: "Pixel Hearts", baseTitle: "Summer Memory", genre: "pop" },
      { artist: "Cassette Club", baseTitle: "Backseat Anthem", genre: "pop" },
      { artist: "Millennium Lights", baseTitle: "Phone Flip", genre: "dance" },
      { artist: "Stereo Diary", baseTitle: "Mall Nights", genre: "pop" },
      { artist: "Flash FM", baseTitle: "Replay Era", genre: "dance" },
    ]),
    playlistNames: ["2000s Flashback", "Drive Home Hits", "Throwback Party", "Nostalgia Core"],
  },
  chill: {
    usernamePrefix: "FocusFlow",
    description: "Calm ambient and focus listener with long sessions and gentle daily routines.",
    activityBias: "morning",
    tracks: buildTracks([
      { artist: "Drift Atlas", baseTitle: "Quiet Desk", genre: "ambient" },
      { artist: "Mono Lake", baseTitle: "Low Tide", genre: "lofi" },
      { artist: "Slow Bloom", baseTitle: "Deep Focus", genre: "ambient" },
      { artist: "Paper Rain", baseTitle: "Study Lamps", genre: "instrumental" },
      { artist: "Blue Static", baseTitle: "Window Noise", genre: "lofi" },
    ]),
    playlistNames: ["Deep Focus", "Reading Rain", "Gentle Mornings", "No-Lyrics Flow"],
  },
  mainstream: {
    usernamePrefix: "DailyMix",
    description: "Casual mainstream listener mixing chart pop, rap singles, and weekly discoveries.",
    activityBias: "evening",
    tracks: buildTracks([
      { artist: "Pulse Avenue", baseTitle: "Top 40 Loop", genre: "pop" },
      { artist: "City Tape", baseTitle: "Hot Take", genre: "hip-hop" },
      { artist: "Nova FM", baseTitle: "Weekend Spin", genre: "dance" },
      { artist: "Glass Metro", baseTitle: "Big Hook", genre: "pop" },
      { artist: "Street Prism", baseTitle: "Night Feed", genre: "rap" },
    ]),
    playlistNames: ["Daily Rotation", "Commute Mix", "Weekend Replay", "Trending Now"],
  },
};

export type DemoPersona = keyof typeof personas;
export type DemoAccountResponse = {
  account: {
    id: string;
    name: string;
    email: string;
    password: string;
    role: "user";
    persona: DemoPersona;
    personaDescription: string;
    createdAt: string;
    seededSongs: number;
    seededFavorites: number;
    seededPlaylists: number;
    seededListeningLogs: number;
    activityWindowDays: number;
  };
};

export function listDemoPersonas() {
  return Object.entries(personas).map(([key, value]) => ({
    key: key as DemoPersona,
    description: value.description,
    usernamePrefix: value.usernamePrefix,
  }));
}

function biasedHour(bias: PersonaTemplate["activityBias"]): number {
  if (bias === "morning") return 7 + Math.floor(Math.random() * 4);
  if (bias === "afternoon") return 12 + Math.floor(Math.random() * 5);
  return 18 + Math.floor(Math.random() * 4);
}

function dateDaysAgo(day: number, hour: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - day);
  date.setUTCHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 50), 0);
  return date.toISOString();
}

export async function generateDemoAccount(persona: DemoPersona = "gym"): Promise<DemoAccountResponse> {
  const template = personas[persona] ?? personas.gym;
  const suffix = Math.floor(Math.random() * 10000);
  const username = `${template.usernamePrefix}${suffix}`;
  const email = `${username.toLowerCase()}@demo.trackly.local`;

  if (await findUserByEmail(email)) {
    return generateDemoAccount(persona);
  }

  const temporaryPassword = `${persona}-${crypto.randomBytes(6).toString("hex")}!`;
  const passwordHash = hashPassword(temporaryPassword);
  const user = await createUser({ username, email, passwordHash, role: "user", isDemo: true });

  const tracks = template.tracks.slice(0, 120);
  const playlistSize = 24;
  for (let i = 0; i < template.playlistNames.length; i += 1) {
    const chunk = tracks.slice(i * playlistSize, i * playlistSize + playlistSize);
    const songs: PlaylistSongRecord[] = chunk.map((track, idx) => ({
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: covers[(idx + i) % covers.length],
    }));
    await createPlaylist(user.id, template.playlistNames[i], undefined, songs);
  }

  for (let i = 0; i < 36; i += 1) {
    const track = tracks[i % tracks.length];
    await createFavorite({
      userId: user.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: covers[i % covers.length],
    });
  }

  let seededListeningLogs = 0;
  for (let day = 0; day < 35; day += 1) {
    const sessions = 2 + Math.floor(Math.random() * 4);
    for (let s = 0; s < sessions; s += 1) {
      const trackIndex = (day * 5 + s * 7 + Math.floor(Math.random() * 6)) % tracks.length;
      const track = tracks[trackIndex];
      await createUserHistory(
        {
          userId: user.id,
          method: day % 5 === 0 ? "image-upload" : "demo-seed",
          title: track.title,
          artist: track.artist,
          album: track.album,
          coverUrl: covers[(trackIndex + s) % covers.length],
          recognized: true,
        },
        { allowDuplicates: true, createdAt: dateDaysAgo(day, biasedHour(template.activityBias)) },
      );
      seededListeningLogs += 1;
    }
  }

  return {
    account: {
      id: user.id,
      name: user.username,
      email: user.email,
      password: temporaryPassword,
      role: "user",
      persona,
      personaDescription: template.description,
      createdAt: user.createdAt,
      seededSongs: tracks.length,
      seededFavorites: 36,
      seededPlaylists: template.playlistNames.length,
      seededListeningLogs,
      activityWindowDays: 35,
    },
  };
}
