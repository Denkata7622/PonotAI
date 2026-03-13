type SongMatch = {
  songName: string;
  artist: string;
  album: string;
  genre: string;
  releaseYear: number | null;
  confidenceScore: number;
  youtubeVideoId?: string;
  platformLinks: { youtube?: string };
};

const BULGARIAN_SONGS: SongMatch[] = [
  { songName: "Nema kak", artist: "Slavi Trifonov", album: "Best Of", genre: "Pop-Folk", releaseYear: 2004, confidenceScore: 0.75, youtubeVideoId: "dQw4w9WgXcQ", platformLinks: { youtube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
  { songName: "100% Zhena", artist: "Gloria", album: "100% Zhena", genre: "Pop-Folk", releaseYear: 2001, confidenceScore: 0.75, youtubeVideoId: "3JZ_D3ELwOQ", platformLinks: { youtube: "https://www.youtube.com/watch?v=3JZ_D3ELwOQ" } },
  { songName: "Sen Trope", artist: "Azis", album: "Sen Trope", genre: "Pop-Folk", releaseYear: 2011, confidenceScore: 0.76, youtubeVideoId: "9bZkp7q19f0", platformLinks: { youtube: "https://www.youtube.com/watch?v=9bZkp7q19f0" } },
  { songName: "Gubya Kontrol", artist: "Miro", album: "Omirotvoren", genre: "Pop", releaseYear: 2008, confidenceScore: 0.74, youtubeVideoId: "kJQP7kiw5Fk", platformLinks: { youtube: "https://www.youtube.com/watch?v=kJQP7kiw5Fk" } },
  { songName: "Fanatichen", artist: "Galena", album: "Fanatichen", genre: "Pop-Folk", releaseYear: 2013, confidenceScore: 0.74, youtubeVideoId: "OPf0YbXqDm0", platformLinks: { youtube: "https://www.youtube.com/watch?v=OPf0YbXqDm0" } },
  { songName: "Zabraneno e", artist: "Cvetelina Yaneva", album: "Zabraneno e", genre: "Pop-Folk", releaseYear: 2016, confidenceScore: 0.73, youtubeVideoId: "L_jWHffIx5E", platformLinks: { youtube: "https://www.youtube.com/watch?v=L_jWHffIx5E" } },
  { songName: "Vodka s Uteshitel", artist: "Preslava", album: "Ludata doide", genre: "Pop-Folk", releaseYear: 2017, confidenceScore: 0.73, youtubeVideoId: "fRh_vgS2dFE", platformLinks: { youtube: "https://www.youtube.com/watch?v=fRh_vgS2dFE" } },
  { songName: "Plachi", artist: "Mile Kitic", album: "Best", genre: "Turbo Folk", releaseYear: 2002, confidenceScore: 0.72, youtubeVideoId: "RgKAFK5djSk", platformLinks: { youtube: "https://www.youtube.com/watch?v=RgKAFK5djSk" } },
  { songName: "Adaptera", artist: "Vasil Naydenov", album: "Evergreen", genre: "Pop", releaseYear: 1982, confidenceScore: 0.72, youtubeVideoId: "YQHsXMglC9A", platformLinks: { youtube: "https://www.youtube.com/watch?v=YQHsXMglC9A" } },
  { songName: "Vetar echi", artist: "Lili Ivanova", album: "Zlatnite", genre: "Pop", releaseYear: 1980, confidenceScore: 0.72, youtubeVideoId: "60ItHLz5WEA", platformLinks: { youtube: "https://www.youtube.com/watch?v=60ItHLz5WEA" } },
  { songName: "Obicham Te", artist: "Galena", album: "Obicham Te", genre: "Pop-Folk", releaseYear: 2015, confidenceScore: 0.71, youtubeVideoId: "pRpeEdMmmQ0", platformLinks: { youtube: "https://www.youtube.com/watch?v=pRpeEdMmmQ0" } },
  { songName: "Kradec na Mechti", artist: "Preslava", album: "Kradec na Mechti", genre: "Pop-Folk", releaseYear: 2014, confidenceScore: 0.71, youtubeVideoId: "hT_nvWreIhg", platformLinks: { youtube: "https://www.youtube.com/watch?v=hT_nvWreIhg" } },
  { songName: "Za Pari", artist: "Azis", album: "Azis 2010", genre: "Pop-Folk", releaseYear: 2010, confidenceScore: 0.71, youtubeVideoId: "09R8_2nJtjg", platformLinks: { youtube: "https://www.youtube.com/watch?v=09R8_2nJtjg" } },
  { songName: "Ti ne si za men", artist: "Gloria", album: "Ti ne si za men", genre: "Pop-Folk", releaseYear: 2003, confidenceScore: 0.71, youtubeVideoId: "2Vv-BfVoq4g", platformLinks: { youtube: "https://www.youtube.com/watch?v=2Vv-BfVoq4g" } },
  { songName: "Ne se spari", artist: "Slavi Trifonov", album: "Ku-Ku Band", genre: "Pop", releaseYear: 2000, confidenceScore: 0.71, youtubeVideoId: "34Na4j8AVgA", platformLinks: { youtube: "https://www.youtube.com/watch?v=34Na4j8AVgA" } },
];

function similarity(a: string, b: string): number {
  const left = a.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
  const right = b.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
  if (!left || !right) return 0;

  const leftCounts = new Map<string, number>();
  for (const char of left) leftCounts.set(char, (leftCounts.get(char) ?? 0) + 1);

  let overlap = 0;
  for (const char of right) {
    const count = leftCounts.get(char) ?? 0;
    if (count > 0) {
      overlap += 1;
      leftCounts.set(char, count - 1);
    }
  }

  return overlap / Math.max(left.length, right.length);
}

export function matchBulgarianSong(text: string): SongMatch | null {
  const normalized = text.trim();
  if (!normalized) return null;

  let best: SongMatch | null = null;
  let bestScore = 0;

  for (const candidate of BULGARIAN_SONGS) {
    const score = Math.max(
      similarity(normalized, `${candidate.songName} ${candidate.artist}`),
      similarity(normalized, candidate.songName),
      similarity(normalized, candidate.artist),
    );

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best || bestScore <= 0.6) return null;
  return { ...best, confidenceScore: Math.max(best.confidenceScore, bestScore) };
}
