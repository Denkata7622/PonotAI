import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(backendRoot, "..");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function isPostgresUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "postgresql:" || parsed.protocol === "postgres:";
  } catch {
    return false;
  }
}

for (const filePath of [
  path.join(projectRoot, ".env.test.local"),
  path.join(projectRoot, ".env.test"),
  path.join(backendRoot, ".env.test.local"),
  path.join(backendRoot, ".env.test"),
]) {
  parseEnvFile(filePath);
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl || !isPostgresUrl(testDatabaseUrl)) {
  console.error([
    "[tests] Full backend tests require TEST_DATABASE_URL to point at a disposable PostgreSQL test database.",
    "[tests] Refusing to fall back to DATABASE_URL so production or malformed local env values are never used.",
    "[tests] Example: TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ponotai_test?schema=public",
  ].join("\n"));
  process.exit(1);
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.PERSISTENCE_MODE = process.env.TEST_PERSISTENCE_MODE?.trim() || "postgres";
process.env.TEST_PERSISTENCE_MODE = process.env.PERSISTENCE_MODE;
process.env.JWT_SECRET = process.env.JWT_SECRET?.trim() || "test-secret";
process.env.AUTH_BYPASS_EMAIL_VERIFICATION = process.env.AUTH_BYPASS_EMAIL_VERIFICATION?.trim() || "true";
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
process.env.SHAZAM_MOCK_RESPONSE = process.env.SHAZAM_MOCK_RESPONSE ?? "";

const tsxCli = path.join(backendRoot, "node_modules", "tsx", "dist", "cli.mjs");
const defaultArgs = ["tests/*.test.ts", "tests/**/*.test.ts"];
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [tsxCli, "--test", "--test-concurrency=1", ...(args.length > 0 ? args : defaultArgs)], {
  cwd: backendRoot,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
