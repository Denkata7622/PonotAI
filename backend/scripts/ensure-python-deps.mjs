import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const packagesDir = path.resolve(".python_packages");
const requirementsPath = path.resolve("requirements.txt");
const ytDlpPackageDir = path.join(packagesDir, "yt_dlp");

function windowsPythonPaths() {
  if (process.platform !== "win32") return [];
  const localAppData = process.env.LOCALAPPDATA;
  const paths = [];
  for (const version of ["312", "313", "314"]) {
    if (localAppData) paths.push(path.join(localAppData, "Programs", "Python", `Python${version}`, "python.exe"));
    paths.push(path.join("C:\\", "Program Files", `Python${version}`, "python.exe"));
  }
  return paths;
}

function candidateKey(candidate) {
  return [candidate.cmd, ...(candidate.args || [])].join(" ");
}

function pythonCandidates() {
  const candidates = [];
  if (process.env.PYTHON_BIN) candidates.push({ label: "PYTHON_BIN", cmd: process.env.PYTHON_BIN, args: [] });
  candidates.push(
    { label: "PATH python", cmd: "python", args: [] },
    { label: "PATH python3", cmd: "python3", args: [] },
    { label: "Python launcher", cmd: "py", args: ["-3"] },
  );
  for (const pythonPath of windowsPythonPaths()) {
    candidates.push({ label: "Windows install path", cmd: pythonPath, args: [] });
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate.cmd) return false;
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runPython(python, args, options = {}) {
  return spawnSync(python.cmd, [...python.args, ...args], {
    encoding: "utf8",
    shell: false,
    stdio: options.stdio ?? "pipe",
    env: { ...process.env, ...(options.env || {}) },
  });
}

function findPython() {
  const checked = [];
  for (const candidate of pythonCandidates()) {
    checked.push(`${candidate.label}: ${candidateKey(candidate)}`);
    const result = runPython(candidate, ["--version"]);
    if (result.status === 0) {
      const version = `${result.stdout || result.stderr}`.trim();
      console.log(`[ok] ${version || `Python ${candidateKey(candidate)}`}`);
      return { python: candidate, checked };
    }
  }
  return { python: undefined, checked };
}

function printPythonHelp(checked) {
  console.error("Python was not found. Checked:");
  for (const item of checked) console.error(`- ${item}`);
  console.error("");
  console.error("Install Python from https://www.python.org/downloads/ and enable Add python.exe to PATH, or install with winget:");
  console.error("  winget install Python.Python.3.12");
  console.error("");
  console.error("You can also set PYTHON_BIN to the full python.exe path, for example:");
  console.error("  $env:PYTHON_BIN=\"$env:LOCALAPPDATA\\Programs\\Python\\Python312\\python.exe\"");
  console.error("");
  console.error("If Python was just installed or PATH was changed, restart VS Code or your terminal before retrying.");
}

function runOrExit(python, args, options = {}) {
  const result = runPython(python, args, { stdio: "inherit", env: options.env });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function installedYtDlpVersion(python) {
  if (!existsSync(ytDlpPackageDir)) return undefined;
  const result = runPython(python, ["-m", "yt_dlp", "--version"], {
    env: { PYTHONPATH: packagesDir },
  });
  if (result.status !== 0) return undefined;
  return `${result.stdout || result.stderr}`.trim().split(/\r?\n/).find(Boolean);
}

const { python, checked } = findPython();
if (!python) {
  printPythonHelp(checked);
  process.exit(1);
}

const installedVersion = installedYtDlpVersion(python);
if (installedVersion) {
  console.log(`[ok] yt-dlp Python package ${installedVersion}`);
  process.exit(0);
}

console.log("Installing backend Python packages...");
runOrExit(python, ["-m", "pip", "install", "--upgrade", "pip"]);
runOrExit(python, [
  "-m",
  "pip",
  "install",
  "--upgrade",
  "--target",
  packagesDir,
  "-r",
  requirementsPath,
]);
