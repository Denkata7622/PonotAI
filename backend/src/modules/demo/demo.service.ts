import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createFavorite,
  createPlaylist,
  createUser,
  createUserHistory,
  findUserByEmail,
  type PlaylistSongRecord,
} from "../../db/authStore";
import { hashPassword } from "../auth/password";

type DemoSong = {
  title: string;
  artist: string;
  album?: string;
  coverUrl: string;
  genre: string;
  mood: string;
  year: number;
  duration: number;
  youtubeVideoId: string;
  persona: string;
};

type PersonaTemplate = {
  key: DemoPersona;
  usernamePrefix: string;
  description: string;
  activityBias: "morning" | "afternoon" | "evening";
  personaLabel: string;
  genres: string[];
  moods: string[];
  playlistNames: string[];
};

const DEMO_DATASET_ERROR_CODE = "DEMO_DATA_UNAVAILABLE";
const DEMO_DATASET_ERROR_MESSAGE = "Demo song dataset is unavailable on the server.";

type DatasetCache = {
  songs: DemoSong[] | null;
  resolvedPath: string | null;
  checkedPaths: string[];
};

let datasetCache: DatasetCache | null = null;

export class DemoDatasetUnavailableError extends Error {
  public readonly code = DEMO_DATASET_ERROR_CODE;
  public readonly checkedPaths: string[];

  constructor(checkedPaths: string[]) {
    super(DEMO_DATASET_ERROR_MESSAGE);
    this.name = "DemoDatasetUnavailableError";
    this.checkedPaths = checkedPaths;
  }
}

export function getDemoSongsDatasetPathCandidates(
  options?: {
    cwd?: string;
    moduleDir?: string;
    overridePaths?: string;
  },
): string[] {
  const cwd = options?.cwd ?? process.cwd();
  const moduleDir = options?.moduleDir ?? __dirname;
  const overridePaths = options?.overridePaths ?? process.env.DEMO_SONGS_DATASET_PATHS;
  if (overridePaths?.trim()) {
    return overridePaths
      .split(path.delimiter)
      .map((candidate) => candidate.trim())
      .filter(Boolean);
  }

  return [
    path.join(moduleDir, "../../data/demoSongs.json"),
    path.join(moduleDir, "../../../src/data/demoSongs.json"),
    path.join(cwd, "src/data/demoSongs.json"),
    path.join(cwd, "dist/data/demoSongs.json"),
  ];
}

function loadDemoSongsDataset(): DatasetCache {
  if (datasetCache) return datasetCache;

  const checkedPaths = getDemoSongsDatasetPathCandidates();
  for (const candidate of checkedPaths) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as DemoSong[];
      datasetCache = { songs: parsed, resolvedPath: candidate, checkedPaths };
      return datasetCache;
    } catch (error) {
      console.warn("[demo] Failed reading demo dataset candidate", { candidate, error });
    }
  }

  console.warn("[demo] Demo song dataset is unavailable. Checked paths:", checkedPaths);
  datasetCache = { songs: null, resolvedPath: null, checkedPaths };
  return datasetCache;
}

export function resetDemoSongsDatasetCacheForTests(): void {
  datasetCache = null;
}

const personas: Record<string, PersonaTemplate> = {
  gym: {
    key: "gym",
    usernamePrefix: "GymPulse",
    description: "High-energy listener built for workout-driven sessions.",
    activityBias: "morning",
    personaLabel: "Gym Motivator",
    genres: ["rock", "metal", "hip-hop", "electronic"],
    moods: ["gym", "workout", "energetic", "intense"],
    playlistNames: ["Warmup Run", "PR Session", "Sprint Mode", "Cooldown Drive"],
  },
  indie: {
    key: "indie",
    usernamePrefix: "IndieExplorer",
    description: "Discovery-focused listener rotating indie, lo-fi, and thoughtful deep cuts.",
    activityBias: "evening",
    personaLabel: "Indie Explorer",
    genres: ["indie", "lo-fi", "ambient", "jazz"],
    moods: ["calm", "moody", "study", "chill"],
    playlistNames: ["New Finds", "Late Discovery", "Coffee + Vinyl", "Hidden Gems"],
  },
  nostalgia: {
    key: "nostalgia",
    usernamePrefix: "RetroWave",
    description: "Throwback-first profile with classic pop and rock replay behavior.",
    activityBias: "afternoon",
    personaLabel: "Pop Fan",
    genres: ["pop", "rock", "R&B", "country"],
    moods: ["upbeat", "groovy", "chill", "story"],
    playlistNames: ["Throwback Loop", "Roadtrip Recall", "Classic Pop", "Sing Along"],
  },
  chill: {
    key: "chill",
    usernamePrefix: "FocusFlow",
    description: "Calm ambient and concentration listener with long sessions.",
    activityBias: "morning",
    personaLabel: "Focus Student",
    genres: ["ambient", "lo-fi", "classical", "jazz"],
    moods: ["focus", "sleep", "study", "calm"],
    playlistNames: ["Deep Focus", "Quiet Mornings", "Reading Room", "Night Reset"],
  },
  mainstream: {
    key: "mainstream",
    usernamePrefix: "DailyMix",
    description: "Mainstream daily listener blending chart hits and gym-ready rotations.",
    activityBias: "evening",
    personaLabel: "Pop Fan",
    genres: ["pop", "hip-hop", "electronic", "R&B"],
    moods: ["party", "upbeat", "energetic", "chill"],
    playlistNames: ["Daily Rotation", "Commute Mix", "Friday Replay", "Discover Weekly"],
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

function createSeededRng(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) state = ((state << 5) - state + seed.charCodeAt(i)) | 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function pickPersonaSongs(template: PersonaTemplate, demoSongs: DemoSong[]): DemoSong[] {
  const filtered = demoSongs.filter((song) => (
    template.genres.includes(song.genre)
    || template.moods.includes(song.mood)
    || song.persona === template.personaLabel
  ));
  const fallback = filtered.length >= 100 ? filtered : demoSongs;
  const deduped = new Map<string, DemoSong>();
  for (const song of fallback) {
    deduped.set(`${song.title}|||${song.artist}`, song);
  }
  return [...deduped.values()].slice(0, 140);
}

function biasedHour(bias: PersonaTemplate["activityBias"], rand: () => number): number {
  if (bias === "morning") return 6 + Math.floor(rand() * 5);
  if (bias === "afternoon") return 12 + Math.floor(rand() * 5);
  return 18 + Math.floor(rand() * 4);
}

function dateDaysAgo(day: number, hour: number, rand: () => number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - day);
  date.setUTCHours(hour, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
  return date.toISOString();
}

export async function generateDemoAccount(persona: DemoPersona = "gym"): Promise<DemoAccountResponse> {
  const { songs: demoSongs, checkedPaths } = loadDemoSongsDataset();
  if (!demoSongs || demoSongs.length === 0) {
    throw new DemoDatasetUnavailableError(checkedPaths);
  }

  const template = personas[persona] ?? personas.gym;
  const suffix = crypto.randomInt(1000, 9999);
  const username = `${template.usernamePrefix}${suffix}`;
  const email = `${username.toLowerCase()}@demo.trackly.local`;

  if (await findUserByEmail(email)) {
    return generateDemoAccount(persona);
  }

  const temporaryPassword = `${persona}-${crypto.randomBytes(6).toString("hex")}!`;
  const passwordHash = hashPassword(temporaryPassword);
  const user = await createUser({ username, email, passwordHash, role: "user", isDemo: true });

  const rand = createSeededRng(`${user.id}:${persona}`);
  const tracks = pickPersonaSongs(template, demoSongs).slice(0, 120);
  const playlistSize = 25;

  for (let i = 0; i < template.playlistNames.length; i += 1) {
    const chunk = tracks.slice(i * playlistSize, i * playlistSize + playlistSize);
    const songs: PlaylistSongRecord[] = chunk.map((track) => ({
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: track.coverUrl,
      videoId: track.youtubeVideoId,
    }));
    await createPlaylist(user.id, template.playlistNames[i], undefined, songs);
  }

  const favoriteCandidates = tracks.slice(0, 36);
  for (const track of favoriteCandidates) {
    await createFavorite({
      userId: user.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: track.coverUrl,
    });
  }

  let seededListeningLogs = 0;
  for (let day = 0; day < 30; day += 1) {
    const sessions = 3 + Math.floor(rand() * 4);
    for (let s = 0; s < sessions; s += 1) {
      const trackIndex = Math.floor(rand() * tracks.length);
      const track = tracks[trackIndex];
      await createUserHistory(
        {
          userId: user.id,
          method: day % 4 === 0 ? "image-upload" : "demo-seed",
          title: track.title,
          artist: track.artist,
          album: track.album,
          coverUrl: track.coverUrl,
          recognized: true,
        },
        { allowDuplicates: true, createdAt: dateDaysAgo(day, biasedHour(template.activityBias, rand), rand) },
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
      seededFavorites: favoriteCandidates.length,
      seededPlaylists: template.playlistNames.length,
      seededListeningLogs,
      activityWindowDays: 30,
    },
  };
}
