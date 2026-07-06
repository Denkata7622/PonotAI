import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';

// ---------- CONFIG ----------
const SOURCE_DIR = 'C:\\Users\\denis\\Downloads\\Test';
const DEST_DIR = 'C:\\Users\\denis\\Downloads\\Unzipped_Songs'; // Change as needed
const DELETE_ZIP_AFTER_EXTRACT = false; // Set to true to delete original ZIP after extraction
const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.m4a', '.wav', '.aac', '.opus'];

// ---------- MAIN ----------
async function main() {
  console.log('🎵 Extracting audio from ZIP files...');

  // Create destination folder if it doesn't exist
  await fs.mkdir(DEST_DIR, { recursive: true });

  const files = await fs.readdir(SOURCE_DIR);
  const zipFiles = files.filter(f => f.endsWith('.zip'));
  console.log(`📁 Found ${zipFiles.length} ZIP files.`);

  let extractedCount = 0;

  for (const zipFile of zipFiles) {
    const zipPath = path.join(SOURCE_DIR, zipFile);
    console.log(`\nProcessing ${zipFile}...`);

    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      // Filter audio entries
      const audioEntries = entries.filter(e => 
        !e.isDirectory && AUDIO_EXTENSIONS.includes(path.extname(e.entryName).toLowerCase())
      );

      if (audioEntries.length === 0) {
        console.log(`  No audio files found, skipping.`);
        continue;
      }

      // Extract each audio file
      for (const entry of audioEntries) {
        const originalFileName = path.basename(entry.entryName);
        const ext = path.extname(originalFileName);
        let baseName = path.basename(originalFileName, ext);
        // Sanitize filename (remove invalid characters)
        baseName = baseName.replace(/[<>:"/\\|?*]/g, '_');
        let destFileName = `${baseName}${ext}`;

        // Handle duplicates
        let counter = 2;
        let finalPath = path.join(DEST_DIR, destFileName);
        while (await fs.access(finalPath).then(() => true).catch(() => false)) {
          destFileName = `${baseName} (${counter})${ext}`;
          finalPath = path.join(DEST_DIR, destFileName);
          counter++;
        }

        // Extract the entry data and write to file
        const data = entry.getData();
        await fs.writeFile(finalPath, data);
        console.log(`  ✅ Extracted: ${destFileName}`);
        extractedCount++;
      }

      // Delete the ZIP if configured
      if (DELETE_ZIP_AFTER_EXTRACT) {
        await fs.unlink(zipPath);
        console.log(`  🗑️ Deleted ZIP: ${zipFile}`);
      }

    } catch (error) {
      console.error(`  ❌ Error processing ${zipFile}: ${error.message}`);
    }
  }

  console.log(`\n🎉 Done! Extracted ${extractedCount} audio file(s) to ${DEST_DIR}`);
}

main().catch(console.error);