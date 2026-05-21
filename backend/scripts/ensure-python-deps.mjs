import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...(options.env || {}) },
  });
  return result.status === 0;
}

function findPython() {
  const candidates = [
    { cmd: process.env.PYTHON_BIN, args: ["--version"] },
    { cmd: "python", args: ["--version"] },
    { cmd: "py", args: ["-3", "--version"] },
    { cmd: "python3", args: ["--version"] },
  ].filter((item) => item.cmd);

  for (const item of candidates) {
    const result = spawnSync(item.cmd, item.args, { encoding: "utf8", shell: false });
    if (result.status === 0) return item.cmd;
  }

  console.error("Python was not found. Install Python and make sure python is in PATH.");
  process.exit(1);
}

const python = findPython();
const packagesDir = path.resolve(".python_packages");
const ytDlpDir = path.join(packagesDir, "yt_dlp");

if (existsSync(ytDlpDir)) {
  const ok = run(python, ["-m", "yt_dlp", "--version"], {
    env: { PYTHONPATH: packagesDir },
  });
  if (ok) process.exit(0);
}

console.log("Installing backend Python packages...");
run(python, ["-m", "pip", "install", "--upgrade", "pip"]);

rmSync(packagesDir, { recursive: true, force: true });

const installed = run(python, [
  "-m",
  "pip",
  "install",
  "--target",
  packagesDir,
  "-r",
  "requirements.txt",
]);

process.exit(installed ? 0 : 1);
