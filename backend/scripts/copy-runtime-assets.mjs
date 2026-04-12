import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, "..");

const assetsToCopy = [
  {
    from: path.join(backendRoot, "src", "data", "demoSongs.json"),
    to: path.join(backendRoot, "dist", "data", "demoSongs.json"),
  },
];

for (const asset of assetsToCopy) {
  await mkdir(path.dirname(asset.to), { recursive: true });
  await copyFile(asset.from, asset.to);
  console.log(`[build] Copied ${path.relative(backendRoot, asset.from)} -> ${path.relative(backendRoot, asset.to)}`);
}
