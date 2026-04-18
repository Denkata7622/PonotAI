import fs from "fs";
import path from "path";

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadEnvironmentFiles(): void {
  const backendRoot = path.resolve(__dirname, "..", "..");
  const projectRoot = path.resolve(backendRoot, "..");

  const candidateFiles = [
    path.join(projectRoot, ".env.local"),
    path.join(projectRoot, ".env"),
    path.join(backendRoot, ".env.local"),
    path.join(backendRoot, ".env"),
  ];

  for (const filePath of candidateFiles) {
    if (!fs.existsSync(filePath)) continue;

    const envValues = parseEnvFile(fs.readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(envValues)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

export function validateEnvironment(): void {
  loadEnvironmentFiles();

  const isProduction = process.env.NODE_ENV === "production";
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const configuredPersistenceMode = process.env.PERSISTENCE_MODE?.trim().toLowerCase();
  const persistenceMode = configuredPersistenceMode || "postgres";
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (jwtSecret) {
    process.env.JWT_SECRET = jwtSecret;
  }

  if (isProduction && !jwtSecret) {
    console.error("FATAL: JWT_SECRET environment variable is required in production");
    process.exit(1);
  }

  if (!isProduction && !jwtSecret) {
    console.warn("WARN: Using default JWT_SECRET — do not use in production");
  }

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
  if (isProduction && allowedOrigins.length === 0) {
    console.error("FATAL: ALLOWED_ORIGINS is required in production");
    process.exit(1);
  }

  if (persistenceMode !== "postgres" && persistenceMode !== "file-legacy") {
    console.error(`FATAL: Unsupported PERSISTENCE_MODE=${persistenceMode}. Allowed values: postgres, file-legacy.`);
    process.exit(1);
  }

  process.env.PERSISTENCE_MODE = persistenceMode;

  if (persistenceMode === "file-legacy") {
    if (isProduction) {
      console.error("FATAL: PERSISTENCE_MODE=file-legacy is blocked in production. Use PostgreSQL runtime persistence.");
      process.exit(1);
    }
    console.warn("[env] Running in legacy file persistence mode (development/testing only).");
  } else {
    if (!databaseUrl) {
      console.error("FATAL: DATABASE_URL is required when PERSISTENCE_MODE is postgres.");
      process.exit(1);
    }
    process.env.DATABASE_URL = databaseUrl;
  }

  const dataDir = process.env.PONOTAI_DATA_DIR?.trim();
  if (dataDir) {
    process.env.PONOTAI_DATA_DIR = dataDir;
  }

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (geminiApiKey) {
    process.env.GEMINI_API_KEY = geminiApiKey;
  } else if (isProduction) {
    console.error("[env] GEMINI_API_KEY missing in production. /api/assistant and image AI OCR will run in degraded mode.");
  }

  const auddToken = process.env.AUDD_API_TOKEN?.trim() || process.env.AUDD_API_KEY?.trim();
  const youtubeKey = process.env.YOUTUBE_API_KEY?.trim();
  const acrKey = process.env.ACRCLOUD_ACCESS_KEY?.trim();
  const acrSecret = process.env.ACRCLOUD_ACCESS_SECRET?.trim();
  const acrHost = process.env.ACRCLOUD_HOST?.trim();

  if (auddToken) {
    process.env.AUDD_API_TOKEN = auddToken;
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail) {
    process.env.ADMIN_EMAIL = adminEmail;
  }

  const geminiModel = process.env.GEMINI_MODEL?.trim();
  if (geminiModel) {
    process.env.GEMINI_MODEL = geminiModel;
  }

  const hasAcrCloud = Boolean(acrKey && acrSecret && acrHost);

  if (!auddToken && !hasAcrCloud) {
    console.warn("[env] No external audio providers fully configured (AuDD/ACRCloud). Recognition will rely on Shazam fallback and local tags.");
  }

  if (!youtubeKey) {
    console.warn("[env] YOUTUBE_API_KEY missing. Verified YouTube links may be unavailable.");
  }
}
