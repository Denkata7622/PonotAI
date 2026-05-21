import { spawnSync } from "node:child_process";

function npmInvocation(args) {
  return process.platform === "win32"
    ? { cmd: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] }
    : { cmd: "npm", args };
}

function run(label, args) {
  console.log(`\n${label}`);
  const invocation = npmInvocation(args);
  const result = spawnSync(invocation.cmd, invocation.args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) console.error(result.error.message);
  return result.status === 0;
}

const okPython = run("Backend Python doctor", ["run", "doctor:python", "--prefix", "backend"]);
const okDownload = run("Frontend downloader doctor", ["run", "doctor:download", "--prefix", "frontend"]);

process.exit(okPython && okDownload ? 0 : 1);
