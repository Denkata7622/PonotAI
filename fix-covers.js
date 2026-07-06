import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execP = promisify(exec);

// ---------- CONFIG ----------
const ZIP_DIR = 'C:\\Users\\denis\\Downloads\\Tidal_Songs';
const API_BASE = 'http://localhost:3000/api/download/tidal';

// ---------- FFMPEG LOCATION ----------
let ffmpegPath = null;
let ffprobePath = null;

try {
  // Try to use ffmpeg-static if installed
  const ffmpegStatic = await import('ffmpeg-static');
  ffmpegPath = ffmpegStatic.default || ffmpegStatic;
  console.log(`✅ ffmpeg-static found at: ${ffmpegPath}`);
} catch {
  console.log('⚠️ ffmpeg-static not installed, falling back to system detection...');
}

if (!ffmpegPath) {
  // Fallback: try to find ffmpeg in PATH or common locations
  async function fileExists(filePath) {
    try { await fs.access(filePath); return true; } catch { return false; }
  }

  async function findBinary(binaryName) {
    // Try where/which
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    try {
      const { stdout } = await execP(`${cmd} ${binaryName}`);
      const found = stdout.split(/\r?\n/)[0].trim();
      if (found && await fileExists(found)) return found;
    } catch {}
    // Check common Windows paths
    const ext = process.platform === 'win32' ? '.exe' : '';
    const userProfile = process.env.USERPROFILE || '';
    const commonPaths = [
      `C:\\Program Files\\ffmpeg\\bin\\${binaryName}${ext}`,
      `C:\\ffmpeg\\bin\\${binaryName}${ext}`,
      `${userProfile}\\scoop\\shims\\${binaryName}${ext}`,
      `${userProfile}\\AppData\\Local\\Microsoft\\WindowsApps\\${binaryName}${ext}`,
    ];
    for (const p of commonPaths) {
      if (await fileExists(p)) return p;
    }
    return null;
  }

  ffmpegPath = await findBinary('ffmpeg');
  if (!ffmpegPath) {
    console.error('❌ ffmpeg not found. Please install ffmpeg or set FFMPEG_PATH.');
    console.error('   You can install ffmpeg-static: npm install ffmpeg-static --save-dev');
    process.exit(1);
  }
}

// Try to find ffprobe similarly
try {
  const ffprobeStatic = await import('ffprobe-static');
  ffprobePath = ffprobeStatic.default || ffprobeStatic;
} catch {
  // Fallback: try to derive from ffmpeg path
  if (ffmpegPath) {
    const dir = path.dirname(ffmpegPath);
    const base = path.basename(ffmpegPath, path.extname(ffmpegPath));
    const probeName = base.replace('ffmpeg', 'ffprobe') + (process.platform === 'win32' ? '.exe' : '');
    const candidate = path.join(dir, probeName);
    const exists = await fs.access(candidate).then(() => true).catch(() => false);
    if (exists) ffprobePath = candidate;
  }
  if (!ffprobePath) {
    // Try system detection
    async function findProbe() {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      try {
        const { stdout } = await execP(`${cmd} ffprobe`);
        const found = stdout.split(/\r?\n/)[0].trim();
        if (found) return found;
      } catch {}
      return null;
    }
    ffprobePath = await findProbe();
    if (!ffprobePath) {
      console.warn('⚠️ ffprobe not found, verification will be skipped.');
    }
  }
}

console.log(`🔍 ffmpeg: ${ffmpegPath}`);
if (ffprobePath) console.log(`🔍 ffprobe: ${ffprobePath}`);

// ---------- HELPERS ----------
async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < retries - 1) {
      const wait = delay * Math.pow(2, attempt);
      console.log(`  ⏳ Rate limited, waiting ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return response;
  }
  throw new Error(`Failed after ${retries} attempts`);
}

async function getCoverBufferFromTidalUrl(artist, title) {
  if (!artist || !title) return null;
  try {
    const query = `${artist} ${title}`;
    const searchUrl = `${API_BASE}?action=search&q=${encodeURIComponent(query)}&artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    console.log(`  TIDAL search: ${searchUrl}`);
    const response = await fetchWithRetry(searchUrl, {}, 3, 1000);
    if (!response.ok) throw new Error(`Search API error: ${response.status}`);
    const data = await response.json();
    const candidates = data.candidates || [];
    if (candidates.length === 0) return null;
    const coverUuid = candidates[0].album?.cover;
    if (!coverUuid) return null;
    const imageUrl = `https://resources.tidal.com/images/${coverUuid}/640x640.jpg`;
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error(`Cover download failed: ${imageRes.status}`);
    return Buffer.from(await imageRes.arrayBuffer());
  } catch (error) {
    console.warn(`  TIDAL cover fetch error: ${error.message}`);
    return null;
  }
}

async function getCoverFromMusicBrainz(artist, album) {
  if (!artist || !album) return null;
  const query = `artist:${encodeURIComponent(artist)} AND release:${encodeURIComponent(album)}`;
  const url = `https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=1`;
  console.log(`  MB query: ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': 'Turrex/1.0' } });
  if (!response.ok) return null;
  const data = await response.json();
  const mbid = data?.releases?.[0]?.id;
  if (!mbid) return null;
  const coverUrl = `https://coverartarchive.org/release/${mbid}/front-500.jpg`;
  const check = await fetch(coverUrl, { method: 'HEAD' });
  if (!check.ok) return null;
  const image = await fetch(coverUrl);
  return image.ok ? Buffer.from(await image.arrayBuffer()) : null;
}

async function getCoverFromDeezer(artist, title, album) {
  const queries = [];
  if (artist && title) queries.push(`${artist} ${title}`);
  if (artist && album) queries.push(`${artist} ${album}`);
  if (queries.length === 0) return null;
  for (const q of queries) {
    const url = `https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=1`;
    console.log(`  Deezer query: ${q}`);
    const response = await fetch(url);
    if (!response.ok) continue;
    const data = await response.json();
    const coverUrl = data?.data?.[0]?.album?.cover_medium;
    if (!coverUrl) continue;
    const image = await fetch(coverUrl);
    if (image.ok) return Buffer.from(await image.arrayBuffer());
  }
  return null;
}

async function replaceEmbeddedCover(audioFilePath, coverBuffer) {
  const tmpDir = path.join(path.dirname(audioFilePath), 'tmp_embed');
  await fs.mkdir(tmpDir, { recursive: true });
  const tempAudio = path.join(tmpDir, `input_${randomUUID()}`);
  const tempCover = path.join(tmpDir, `cover_${randomUUID()}.jpg`);
  const outputAudio = path.join(tmpDir, `output_${randomUUID()}`);

  try {
    await fs.copyFile(audioFilePath, tempAudio);
    await fs.writeFile(tempCover, coverBuffer);

    const ext = path.extname(audioFilePath).toLowerCase();
    const outputFile = `${outputAudio}${ext}`;

    const cmd = `"${ffmpegPath}" -y -i "${tempAudio}" -i "${tempCover}" -map 0:a -map 1 -c:a copy -c:v copy -disposition:v attached_pic "${outputFile}"`;
    await execP(cmd);

    if (ffprobePath) {
      const verify = await verifyAudioFile(outputFile);
      if (!verify.hasCover) {
        console.warn('  ⚠️ ffmpeg did not embed cover, but continuing...');
      }
    }

    await fs.copyFile(outputFile, audioFilePath);
    return true;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function verifyAudioFile(filePath) {
  const probeCmd = `"${ffprobePath}" -v error -show_entries stream=codec_name,codec_type,bit_rate -of json "${filePath}"`;
  const { stdout } = await execP(probeCmd);
  const info = JSON.parse(stdout);
  const streams = info.streams || [];
  const audioStream = streams.find(s => s.codec_type === 'audio');
  const videoStream = streams.find(s => s.codec_type === 'video');

  if (!audioStream) {
    return { ok: false, error: 'No audio stream found' };
  }

  const hasCover = videoStream && videoStream.codec_name === 'mjpeg';
  return {
    ok: true,
    hasCover,
    codec: audioStream.codec_name,
    bitrate: parseInt(audioStream.bit_rate) / 1000,
  };
}

// ---------- MAIN ----------
async function main() {
  console.log('✅ Starting cover fixer...');

  // Verify ffmpeg works
  try {
    await execP(`"${ffmpegPath}" -version`);
    console.log('✅ ffmpeg is usable.');
  } catch (err) {
    console.error(`❌ ffmpeg at "${ffmpegPath}" is not executable: ${err.message}`);
    process.exit(1);
  }

  const files = await fs.readdir(ZIP_DIR);
  const zipFiles = files.filter(f => f.endsWith('.zip'));

  let success = 0, fail = 0;

  for (const zipFile of zipFiles) {
    const zipPath = path.join(ZIP_DIR, zipFile);
    console.log(`\nProcessing ${zipFile}...`);

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    const manifestEntry = entries.find(e => e.entryName === 'manifest.json');
    if (!manifestEntry) { console.warn('  No manifest, skipping...'); continue; }

    const manifestContent = manifestEntry.getData().toString('utf-8');
    let manifest;
    try { manifest = JSON.parse(manifestContent); } catch { console.warn('  Invalid manifest, skipping...'); continue; }

    const metadata = manifest.sourceFiles?.[0]?.metadata || {};
    const artist = metadata.artist || manifest.metadataOverride?.artist || '';
    const album = metadata.album || manifest.metadataOverride?.album || '';
    const title = metadata.title || manifest.metadataOverride?.title || '';

    console.log(`  Artist: "${artist}"`);
    console.log(`  Album:  "${album}"`);
    console.log(`  Title:  "${title}"`);

    let coverPath = manifest.cover?.zipPath || manifest.files?.find(f => f.endsWith('cover.jpg'));
    if (!coverPath) {
      const coverEntry = entries.find(e => e.entryName.endsWith('cover.jpg'));
      if (coverEntry) coverPath = coverEntry.entryName;
    }
    if (!coverPath) { console.warn('  No cover.jpg, skipping...'); continue; }
    console.log(`  Cover path: ${coverPath}`);

    const allEntryNames = entries.map(e => e.entryName);
    const audioExtensions = /\.(flac|mp3|m4a)$/i;
    let audioFiles = allEntryNames.filter(name => audioExtensions.test(name));
    if (audioFiles.length === 0) {
      if (manifest.processedFiles && Array.isArray(manifest.processedFiles)) {
        audioFiles = manifest.processedFiles.map(f => f.file).filter(Boolean).filter(name => audioExtensions.test(name));
      }
      if (audioFiles.length === 0 && manifest.files && Array.isArray(manifest.files)) {
        audioFiles = manifest.files.filter(f => audioExtensions.test(f));
      }
    }
    audioFiles = [...new Set(audioFiles)];
    const validAudioFiles = audioFiles.filter(name => entries.some(e => e.entryName === name));

    if (validAudioFiles.length === 0) {
      console.warn('  No audio files found in ZIP, skipping embedded update...');
    } else {
      console.log(`  Found ${validAudioFiles.length} audio file(s):`);
      validAudioFiles.forEach(f => console.log(`    - ${f}`));
    }

    let coverBuffer = null;

    if (artist && title) {
      console.log('  Trying TIDAL via local search...');
      coverBuffer = await getCoverBufferFromTidalUrl(artist, title);
      if (coverBuffer) console.log('  ✅ Got cover from TIDAL');
    }

    if (!coverBuffer && artist && album) {
      console.log('  Trying MusicBrainz...');
      coverBuffer = await getCoverFromMusicBrainz(artist, album);
      if (coverBuffer) console.log('  ✅ Got cover from MusicBrainz');
    }

    if (!coverBuffer) {
      console.log('  Trying Deezer...');
      coverBuffer = await getCoverFromDeezer(artist, title, album);
      if (coverBuffer) console.log('  ✅ Got cover from Deezer');
    }

    if (!coverBuffer) {
      console.warn('  ❌ No cover found, skipping...');
      fail++;
      continue;
    }

    // Update standalone cover.jpg
    zip.deleteEntry(coverPath);
    zip.addFile(coverPath, coverBuffer);

    // Update embedded covers
    let allGood = true;
    for (const audioEntryName of validAudioFiles) {
      const audioEntry = entries.find(e => e.entryName === audioEntryName);
      if (!audioEntry) {
        console.warn(`  Audio entry "${audioEntryName}" not found, skipping`);
        continue;
      }

      console.log(`  Processing audio: ${audioEntryName}`);
      const audioBuffer = audioEntry.getData();
      const ext = path.extname(audioEntryName);
      const tempDir = path.join(path.dirname(zipPath), 'temp_audio');
      await fs.mkdir(tempDir, { recursive: true });
      const tempAudioPath = path.join(tempDir, `audio_${randomUUID()}${ext}`);
      await fs.writeFile(tempAudioPath, audioBuffer);

      try {
        await replaceEmbeddedCover(tempAudioPath, coverBuffer);

        if (ffprobePath) {
          const verify = await verifyAudioFile(tempAudioPath);
          if (!verify.ok) {
            console.warn(`  ⚠️ Audio verification failed: ${verify.error}`);
            allGood = false;
          } else {
            console.log(`  ✅ Audio verified (${verify.codec}, ${verify.bitrate.toFixed(0)} kbps, cover: ${verify.hasCover ? '✅' : '❌'})`);
          }
        }

        const newAudioBuffer = await fs.readFile(tempAudioPath);
        zip.deleteEntry(audioEntryName);
        zip.addFile(audioEntryName, newAudioBuffer);
        console.log(`  ✅ Updated embedded cover in ${audioEntryName}`);
      } catch (err) {
        console.error(`  ❌ Failed to update embedded cover: ${err.message}`);
        allGood = false;
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }

    if (!allGood) {
      console.warn(`  ⚠️ Some audio files had issues, but ZIP was still saved.`);
    }

    zip.writeZip(zipPath);
    console.log(`  ✅ ZIP saved`);
    success++;

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n🎉 Done! ${success} updated, ${fail} failed.`);
}

main().catch(console.error);