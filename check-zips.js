import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';

const ZIP_DIR = 'C:\\Users\\denis\\Downloads\\Tidal_Songs';

async function main() {
  console.log('🔍 Checking ZIP files for corruption...');

  // Check if directory exists
  try {
    await fs.access(ZIP_DIR);
    console.log(`📁 Directory exists: ${ZIP_DIR}`);
  } catch {
    console.error(`❌ Directory not found: ${ZIP_DIR}`);
    process.exit(1);
  }

  const files = await fs.readdir(ZIP_DIR);
  const zipFiles = files.filter(f => f.endsWith('.zip'));
  console.log(`📁 Found ${zipFiles.length} ZIP files.`);

  let broken = [];
  let ok = 0;

  for (const file of zipFiles) {
    const zipPath = path.join(ZIP_DIR, file);
    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries(); // This will throw if ZIP is corrupt
      if (entries.length === 0) {
        console.log(`⚠️ ${file} appears empty`);
        broken.push(file);
      } else {
        ok++;
        // Optional: verify by checking if a manifest exists? Not necessary.
        console.log(`✅ ${file} OK`);
      }
    } catch (err) {
      console.log(`❌ ${file} is corrupted: ${err.message}`);
      broken.push(file);
    }
  }

  console.log(`\n✅ ${ok} ZIPs are OK.`);
  console.log(`❌ ${broken.length} ZIP(s) are broken:`);
  broken.forEach(f => console.log(`  - ${f}`));
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});