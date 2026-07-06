import {
  Song,
  normalizeSong,
  deduplicateSongs,
  fixTypos,
  resolveUnknownArtists,
  finalizeSongs,
  runCleaningPipeline,
} from '../../lib/songCleaning';

const createMockSong = (overrides: Partial<Song>): Song => ({
  id: `id_${Math.random()}`,
  title: 'Test Title',
  artist: 'Test Artist',
  sourceImageIds: ['img1'],
  confidence: 0.9,
  selected: true,
  needsReview: false,
  manuallyConfirmed: false,
  ...overrides,
});

describe('Song Cleaning Pipeline', () => {
  describe('Stage 1: normalizeSong', () => {
    it('should trim whitespace from title and artist', () => {
      const song = createMockSong({ title: '  Some Song  ', artist: '  An Artist  ' });
      const normalized = normalizeSong(song);
      expect(normalized.title).toBe('Some Song');
      expect(normalized.artist).toBe('An Artist');
    });

    it('should collapse multiple spaces', () => {
      const song = createMockSong({ title: 'A    Song   Title', artist: 'The     Artist' });
      const normalized = normalizeSong(song);
      expect(normalized.title).toBe('A Song Title');
      expect(normalized.artist).toBe('The Artist');
    });

    it('should strip trailing OCR noise characters', () => {
      expect(normalizeSong(createMockSong({ title: 'Song®' })).title).toBe('Song');
      expect(normalizeSong(createMockSong({ title: 'Song☺' })).title).toBe('Song');
      expect(normalizeSong(createMockSong({ title: 'Song✎' })).title).toBe('Song');
      expect(normalizeSong(createMockSong({ title: 'Song···' })).title).toBe('Song');
    });

    it('should strip " - Single" and " - EP" suffixes', () => {
      expect(normalizeSong(createMockSong({ title: 'My Song - Single' })).title).toBe('My Song');
      expect(normalizeSong(createMockSong({ title: 'My Song - EP' })).title).toBe('My Song');
    });
    
    it('should strip trailing " B"', () => {
        const song = createMockSong({ title: 'Some Title B' });
        const normalized = normalizeSong(song);
        expect(normalized.title).toBe('Some Title');
    });

    it('should create lowercased normalizedTitle and normalizedArtist fields', () => {
      const song = createMockSong({ title: 'A Cool Song', artist: 'The Band' });
      const normalized = normalizeSong(song);
      expect(normalized.normalizedTitle).toBe('a cool song');
      expect(normalized.normalizedArtist).toBe('the band');
    });
  });

  describe('Stage 2: deduplicateSongs', () => {
    it('should merge duplicates with same title, preferring known artist', () => {
      const songs = [
        normalizeSong(createMockSong({ title: 'Same Song', artist: 'Unknown Artist', sourceImageIds: ['img1'] })),
        normalizeSong(createMockSong({ title: 'Same Song', artist: 'Real Artist', sourceImageIds: ['img2'] })),
      ];
      const deduplicated = deduplicateSongs(songs);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].artist).toBe('Real Artist');
      expect(deduplicated[0].duplicateMerged).toBe(true);
      expect(deduplicated[0].sourceImageIds).toEqual(expect.arrayContaining(['img1', 'img2']));
    });

    it('should merge duplicates, preferring entry with a known album', () => {
      const songs = [
        normalizeSong(createMockSong({ title: 'Same Song', artist: 'Unknown Artist', album: 'Greatest Hits', sourceImageIds: ['img1'] })),
        normalizeSong(createMockSong({ title: 'Same Song', artist: 'Unknown Artist', album: 'Unknown Album', sourceImageIds: ['img2'] })),
      ];
      const deduplicated = deduplicateSongs(songs);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].album).toBe('Greatest Hits');
      expect(deduplicated[0].duplicateMerged).toBe(true);
    });

    it('should NOT merge songs with the same title but different known artists', () => {
      const songs = [
        normalizeSong(createMockSong({ title: 'Cover Song', artist: 'Artist One' })),
        normalizeSong(createMockSong({ title: 'Cover Song', artist: 'Artist Two' })),
      ];
      const deduplicated = deduplicateSongs(songs);
      expect(deduplicated).toHaveLength(2);
    });
    
    it('should combine sourceImageIds from all duplicates', () => {
      const songs = [
        normalizeSong(createMockSong({ title: 'Same Song', artist: 'Artist', sourceImageIds: ['a', 'b'] })),
        normalizeSong(createMockSong({ title: 'Same Song', artist: 'Artist', sourceImageIds: ['c'] })),
        normalizeSong(createMockSong({ title: 'Same Song', artist: 'Unknown Artist', sourceImageIds: ['d', 'e'] })),
      ];
      const deduplicated = deduplicateSongs(songs);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].sourceImageIds).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd', 'e']));
      expect(deduplicated[0].sourceImageIds.length).toBe(5);
    });
  });

  describe('Stage 3: fixTypos', () => {
    it('should fix common artist typos', () => {
      expect(fixTypos(createMockSong({ artist: 'daf punk' })).artist).toBe('Daft Punk');
      expect(fixTypos(createMockSong({ artist: 'jay - z' })).artist).toBe('JAY-Z');
      expect(fixTypos(createMockSong({ artist: 'unkown artist' })).artist).toBe('Unknown Artist');
    });

    it('should handle title truncation with " ("', () => {
      const song = createMockSong({ title: 'A Long Title (' });
      const fixed = fixTypos(song);
      expect(fixed.title).toBe('A Long Title ( [truncated]');
      expect(fixed.needsReview).toBe(true);
    });
    
    it('should remove trailing capital letters from titles', () => {
        const song = createMockSong({ title: 'Some Title R' });
        const fixed = fixTypos(song);
        expect(fixed.title).toBe('Some Title');
        expect(fixed.needsReview).toBe(true);
    });
  });

  describe('Stage 4: resolveUnknownArtists', () => {
    it('should resolve "Unknown Artist" if a peer with a known artist exists', () => {
      const songs = [
        normalizeSong(createMockSong({ title: 'Peer-Matched Song', artist: 'Known Artist' })),
        normalizeSong(createMockSong({ title: 'Peer-Matched Song', artist: 'Unknown Artist' })),
      ];
      const resolved = resolveUnknownArtists(songs);
      const unknownSong = resolved.find(s => s.artistResolvedFrom === 'peer-match');
      expect(unknownSong?.artist).toBe('Known Artist');
    });

    it('should flag for review if multiple known artists exist for the same title', () => {
      const songs = [
        normalizeSong(createMockSong({ title: 'Conflict Song', artist: 'Artist A' })),
        normalizeSong(createMockSong({ title: 'Conflict Song', artist: 'Artist B' })),
        normalizeSong(createMockSong({ title: 'Conflict Song', artist: 'Unknown Artist' })),
      ];
      const resolved = resolveUnknownArtists(songs);
      const conflictSong = resolved.find(s => s.artist === 'Unknown Artist');
      expect(conflictSong?.needsReview).toBe(true);
      expect(conflictSong?.artistConflict).toBe(true);
    });
  });

  describe('Stage 5: finalizeSongs', () => {
    it('should remove normalizedTitle and normalizedArtist fields', () => {
      const songs = [
        { ...createMockSong({}), normalizedTitle: 'a', normalizedArtist: 'b' }
      ];
      const final = finalizeSongs(songs);
      expect(final[0]).not.toHaveProperty('normalizedTitle');
      expect(final[0]).not.toHaveProperty('normalizedArtist');
    });

    it('should sort songs by artist, then by title', () => {
      const songs = [
        createMockSong({ artist: 'Beta', title: 'Song 1' }),
        createMockSong({ artist: 'Alpha', title: 'Song 2' }),
        createMockSong({ artist: 'Alpha', title: 'Song 1' }),
      ];
      const final = finalizeSongs(songs);
      expect(final.map(s => `${s.artist} - ${s.title}`)).toEqual([
        'Alpha - Song 1',
        'Alpha - Song 2',
        'Beta - Song 1',
      ]);
    });
  });

  describe('Full Pipeline: runCleaningPipeline', () => {
    it('should run all stages and produce a clean, sorted, and deduplicated list', () => {
      const rawSongs: Song[] = [
        createMockSong({ title: '  GooD SonG - EP ', artist: '  The BanD  ' , sourceImageIds:['img1']}),
        createMockSong({ title: 'Good Song', artist: 'unkown artist', sourceImageIds:['img2'] }),
        createMockSong({ title: 'Another Song', artist: 'artist z' }),
        createMockSong({ title: 'Another Song', artist: 'artist a' }),
      ];

      const cleaned = runCleaningPipeline(rawSongs);
      
      expect(cleaned).toHaveLength(3);

      // Test deduplication and typo fixing
      const goodSong = cleaned.find(s => s.title === 'GooD SonG');
      expect(goodSong?.artist).toBe('The BanD');
      expect(goodSong?.duplicateMerged).toBe(true);
      expect(goodSong?.sourceImageIds).toEqual(expect.arrayContaining(['img1','img2']));

      // Test non-merging and sorting
      expect(cleaned[0].artist).toBe('artist a');
      expect(cleaned[1].artist).toBe('artist z');
      expect(cleaned[2].artist).toBe('The BanD');
      
      // Test finalization
      expect(cleaned[0]).not.toHaveProperty('normalizedTitle');
    });
  });
});
