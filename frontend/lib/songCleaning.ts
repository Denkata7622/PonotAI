export type Song = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  releaseYear?: number | null;
  coverUrl?: string | null;
  sourceImageIds: string[];
  rawText?: string;
  confidence: number;
  selected: boolean;
  needsReview: boolean;
  manuallyConfirmed: boolean;
  duplicateMerged?: boolean;
  manuallyEdited?: boolean;
  normalizedTitle?: string;
  normalizedArtist?: string;
  artistResolvedFrom?: string;
  artistConflict?: boolean;
};

// Stage 1: Normalize
/**
 * Normalizes a song object by stripping OCR noise, trimming whitespace,
 * collapsing multiple spaces, and creating lowercased normalized fields for comparison.
 * @param song The song object to normalize.
 * @returns The normalized song object.
 */
export function normalizeSong(song: Song): Song {
  let cleanedTitle = (song.title || "").trim();
  let cleanedArtist = (song.artist || "").trim();

  // Strip OCR noise from titles only: trailing ®, ☺, ✎, ···, - Single, - EP, and lone trailing capital letters
  cleanedTitle = cleanedTitle
    .replace(/\s-\s(Single|EP)$/g, "")
    .replace(/[®☺✎]$/g, "")
    .replace(/···$/g, "")
    .replace(/\s[A-Z]$/g, "")
    .trim();

  // Trim all whitespace and collapse multiple spaces into one
  cleanedTitle = cleanedTitle.replace(/\s+/g, " ").trim();
  cleanedArtist = cleanedArtist.replace(/\s+/g, " ").trim();

  return {
    ...song,
    title: cleanedTitle,
    artist: cleanedArtist,
    normalizedTitle: cleanedTitle.toLowerCase(),
    normalizedArtist: cleanedArtist.toLowerCase(),
  };
}

// Stage 2: Deduplicate (Should run after typo/artist resolution)
/**
 * Deduplicates an array of songs based on normalizedTitle and specific merging rules.
 * Songs with different known artists for the same title are kept separate.
 * Otherwise, songs with the same normalizedTitle are merged, preferring known artists/albums.
 * @param songs The array of songs to deduplicate.
 * @returns A new array with deduplicated songs.
 */
export function deduplicateSongs(songs: Song[]): Song[] {
  const groupedByNormalizedTitle = new Map<string, Song[]>();
  // Using a regex for case-insensitivity check of "Unknown Artist" and "Unkown Artist"
  const unknownArtistRegex = /^(unknown artist|unkown artist)$/i;

  // Group songs by normalizedTitle
  for (const song of songs) {
    if (song.normalizedTitle) {
      const group = groupedByNormalizedTitle.get(song.normalizedTitle) || [];
      group.push(song);
      groupedByNormalizedTitle.set(song.normalizedTitle, group);
    }
  }

  const deduplicated: Song[] = [];
  for (const [/* normalizedTitle */, group] of groupedByNormalizedTitle.entries()) {
    if (group.length === 0) continue;

    // Rule: Never merge songs where both have different known artists, even if titles match
    const distinctKnownArtists = new Set<string>();
    for (const s of group) {
      if (s.artist && !unknownArtistRegex.test(s.artist)) {
        distinctKnownArtists.add(s.normalizedArtist || s.artist.toLowerCase());
      }
    }

    if (distinctKnownArtists.size > 1) {
      deduplicated.push(...group.map(s => ({ ...s })));
      continue;
    }

    // --- Proceed with merging ---
    let bestCandidateSong: Song = group[0];
    const mergedSourceImageIds = new Set<string>(bestCandidateSong.sourceImageIds || []);

    for (let i = 0; i < group.length; i++) {
        const currentSong = group[i];

        if (currentSong.sourceImageIds) {
            currentSong.sourceImageIds.forEach(id => mergedSourceImageIds.add(id));
        }

        if (i === 0) continue;

        const isBestCandidateArtistUnknown = bestCandidateSong.artist ? unknownArtistRegex.test(bestCandidateSong.artist) : true;
        const isCurrentArtistUnknown = currentSong.artist ? unknownArtistRegex.test(currentSong.artist) : true;
        const bestCandidateAlbumKnown = bestCandidateSong.album && bestCandidateSong.album.toLowerCase() !== "unknown album";
        const currentAlbumKnown = currentSong.album && currentSong.album.toLowerCase() !== "unknown album";

        if (isBestCandidateArtistUnknown && !isCurrentArtistUnknown) {
            bestCandidateSong = currentSong;
        } 
        else if (isBestCandidateArtistUnknown === isCurrentArtistUnknown) {
            if (!bestCandidateAlbumKnown && currentAlbumKnown) {
                bestCandidateSong = currentSong;
            }
        }
    }

    const primarySong: Song = { ...bestCandidateSong };
    primarySong.sourceImageIds = Array.from(mergedSourceImageIds);
    primarySong.duplicateMerged = group.length > 1;
    deduplicated.push(primarySong);
  }

  return deduplicated;
}

// Stage 3: Fix typos and OCR errors
/**
 * Fixes common typos and OCR errors in song artists and titles.
 * @param song The song object to fix.
 * @returns The song object with fixed typos and OCR errors.
 */
export function fixTypos(song: Song): Song {
  let fixedArtist = song.artist || "";
  let fixedTitle = song.title || "";
  let needsReview = song.needsReview || false;

  const artistTypoCorrections: { regex: RegExp; replacement: string }[] = [
    { regex: /daf punk/i, replacement: "Daft Punk" },
    { regex: /bc dc/i, replacement: "AC/DC" },
    { regex: /airbourna/i, replacement: "Airbourne" },
    { regex: /papa roac/i, replacement: "Papa Roach" },
    { regex: /methodman redman/i, replacement: "Method Man, Redman" },
    { regex: /pethshady eminem/i, replacement: "Eminem" },
    { regex: /jay - z/i, replacement: "JAY-Z" },
    { regex: /ac \/ dc/i, replacement: "AC/DC" },
    { regex: /unkown artist/i, replacement: "Unknown Artist" },
    { regex: /eazy - e/i, replacement: "Eazy-E" },
    { regex: /2pac/i, replacement: "2Pac" },
    { regex: /linkin park/i, replacement: "Linkin Park" },
    { regex: /disturbed/i, replacement: "Disturbed" },
    { regex: /shinedown/i, replacement: "Shinedown" },
    { regex: /mgk/i, replacement: "Machine Gun Kelly" },
    { regex: /bbno \$/i, replacement: "bbno$" },
  ];

  for (const correction of artistTypoCorrections) {
    if (fixedArtist.match(correction.regex)) {
      fixedArtist = fixedArtist.replace(correction.regex, correction.replacement);
      break;
    }
  }

  if (fixedTitle.endsWith(" (")) {
    fixedTitle = fixedTitle + " [truncated]";
    needsReview = true;
  }

  const trailingCapitalMatch = fixedTitle.match(/\s([A-Z])$/);
  if (trailingCapitalMatch) {
    fixedTitle = fixedTitle.slice(0, -trailingCapitalMatch[0].length).trim();
    needsReview = true;
  }

  return {
    ...song,
    artist: fixedArtist,
    title: fixedTitle,
    normalizedArtist: fixedArtist.toLowerCase(),
    normalizedTitle: fixedTitle.toLowerCase(),
    needsReview: needsReview,
  };
}

// Stage 4: Resolve unknown artists
/**
 * Resolves unknown artists by peer-matching within the dataset.
 * @param songs The array of songs to process.
 * @returns A new array with unknown artists resolved where possible.
 */
export function resolveUnknownArtists(songs: Song[]): Song[] {
  const resolvedSongs = songs.map((s) => ({ ...s }));
  const knownArtistMap = new Map<string, Set<string>>();
  const unknownArtistRegex = /^(unknown artist|unkown artist)$/i;

  for (const song of resolvedSongs) {
    if (song.normalizedTitle && song.artist && !unknownArtistRegex.test(song.artist)) {
      if (!knownArtistMap.has(song.normalizedTitle)) {
        knownArtistMap.set(song.normalizedTitle, new Set());
      }
      knownArtistMap.get(song.normalizedTitle)?.add(song.artist);
    }
  }

  for (const song of resolvedSongs) {
    if (song.artist && unknownArtistRegex.test(song.artist) && song.normalizedTitle) {
      const potentialArtists = knownArtistMap.get(song.normalizedTitle);

      if (potentialArtists) {
        if (potentialArtists.size === 1) {
          const newArtist = potentialArtists.values().next().value;
          if (newArtist) {
            song.artist = newArtist;
            song.normalizedArtist = newArtist.toLowerCase();
            song.manuallyConfirmed = false;
            song.artistResolvedFrom = "peer-match";
          }
        } else if (potentialArtists.size > 1) {
          song.needsReview = true;
          song.artistConflict = true;
        }
      }
    }
  }

  return resolvedSongs;
}

// Stage 5: Output
/**
 * Finalizes the song array for output: removes internal normalized fields and sorts the array.
 * @param songs The array of songs to finalize.
 * @returns The final sorted array of songs.
 */
export function finalizeSongs(songs: Song[]): Song[] {
  const cleanedSongs = songs.map(({ normalizedTitle, normalizedArtist, ...rest }) => rest);

  cleanedSongs.sort((a, b) => {
    const artistA = a.artist || "";
    const artistB = b.artist || "";
    const titleA = a.title || "";
    const titleB = b.title || "";

    const artistCompare = artistA.localeCompare(artistB);
    if (artistCompare !== 0) {
      return artistCompare;
    }
    return titleA.localeCompare(titleB);
  });

  return cleanedSongs;
}

/**
 * Runs the complete song data cleaning pipeline.
 * @param songs The array of raw song data.
 * @returns The cleaned and finalized array of songs.
 */
export function runCleaningPipeline(songs: Song[]): Song[] {
  // The correct pipeline order:
  // 1. Normalize fields for consistent comparison.
  // 2. Fix typos to ensure artists like "Daf Punk" become "Daft Punk" before deduplication.
  // 3. Resolve unknown artists where possible to allow merging with known-artist entries.
  // 4. Deduplicate, now that artist and title data is cleaner.
  // 5. Finalize for output.
  let processedSongs = songs.map(normalizeSong);
  processedSongs = processedSongs.map(fixTypos);
  processedSongs = resolveUnknownArtists(processedSongs);
  processedSongs = deduplicateSongs(processedSongs);
  const finalSongs = finalizeSongs(processedSongs);

  return finalSongs;
}