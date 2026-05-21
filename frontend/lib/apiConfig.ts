/**
 * Centralized frontend to backend API configuration.
 *
 * Client code can only rely on NEXT_PUBLIC_* values because Next.js inlines
 * them at build time. Server routes can additionally use TRACKLY_API_BASE_URL
 * at runtime. Helpers in this file keep those two worlds explicit.
 */

const DEFAULT_DEV_API_URL = "http://localhost:4000";
export const EXPECTED_BACKEND_URL_EXAMPLE = "https://trackly-production-6ec0.up.railway.app";
const SETUP_MESSAGE = `Backend API URL is not configured for backend-powered features. Set NEXT_PUBLIC_API_BASE_URL=${EXPECTED_BACKEND_URL_EXAMPLE} on the Railway frontend service and rebuild/redeploy the frontend. The local ZIP downloader can still export files, direct audio URLs, and YouTube fallback through the frontend /api/download route.`;
const INVALID_PROTOCOL_MESSAGE = `Backend API URL must include http:// or https://. Expected shape: ${EXPECTED_BACKEND_URL_EXAMPLE}`;

export type ApiConfigErrorCode = "api-config-missing" | "api-config-invalid";
export type ApiConfigSource = "NEXT_PUBLIC_API_BASE_URL" | "TRACKLY_API_BASE_URL" | "localhost-default" | "missing";

export class ApiConfigError extends Error {
  code: ApiConfigErrorCode;
  setupMessage: string;

  constructor(message = SETUP_MESSAGE, code: ApiConfigErrorCode = "api-config-missing") {
    super(message);
    this.name = "ApiConfigError";
    this.code = code;
    this.setupMessage = message;
  }
}

export type ApiConfigStatus = {
  configured: boolean;
  baseUrl: string | null;
  source: ApiConfigSource;
  isLocalhost: boolean;
  isProduction: boolean;
  code: ApiConfigErrorCode | null;
  message: string | null;
  fix: string | null;
  expectedValue: string;
  hostname: string | null;
};

export type NormalizedApiBaseUrl = {
  ok: boolean;
  value: string | null;
  hostname: string | null;
  origin: string | null;
  code: ApiConfigErrorCode | null;
  message: string | null;
};

function stripWrappingQuotes(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizeApiBaseUrl(rawValue: string | undefined | null): NormalizedApiBaseUrl {
  const trimmed = stripWrappingQuotes(rawValue ?? "");
  if (!trimmed) {
    return {
      ok: false,
      value: null,
      hostname: null,
      origin: null,
      code: "api-config-missing",
      message: SETUP_MESSAGE,
    };
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      ok: false,
      value: null,
      hostname: null,
      origin: null,
      code: "api-config-invalid",
      message: INVALID_PROTOCOL_MESSAGE,
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        ok: false,
        value: null,
        hostname: null,
        origin: null,
        code: "api-config-invalid",
        message: INVALID_PROTOCOL_MESSAGE,
      };
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const normalized = url.toString().replace(/\/+$/, "");
    return {
      ok: true,
      value: normalized,
      hostname: url.hostname,
      origin: url.origin,
      code: null,
      message: null,
    };
  } catch {
    return {
      ok: false,
      value: null,
      hostname: null,
      origin: null,
      code: "api-config-invalid",
      message: INVALID_PROTOCOL_MESSAGE,
    };
  }
}

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function currentHostIsLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  return isLocalhostHost(window.location?.hostname ?? "");
}

function configuredPublicEnvBaseUrl(): { value: string; source: ApiConfigSource } | null {
  const primary = stripWrappingQuotes(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (primary) return { value: primary, source: "NEXT_PUBLIC_API_BASE_URL" };
  return null;
}

function configuredCurrentRuntimeEnvBaseUrl(): { value: string; source: ApiConfigSource } | null {
  const publicValue = configuredPublicEnvBaseUrl();
  if (publicValue) return publicValue;
  if (typeof window === "undefined") {
    const runtime = stripWrappingQuotes(process.env.TRACKLY_API_BASE_URL);
    if (runtime) return { value: runtime, source: "TRACKLY_API_BASE_URL" };
  }
  return null;
}

function configuredServerEnvBaseUrl(): { value: string; source: ApiConfigSource } | null {
  const runtime = stripWrappingQuotes(process.env.TRACKLY_API_BASE_URL);
  if (runtime) return { value: runtime, source: "TRACKLY_API_BASE_URL" };
  return configuredPublicEnvBaseUrl();
}

function statusFromEnv(
  envBaseUrl: { value: string; source: ApiConfigSource } | null,
  options: { allowLocalhostFallback: boolean; isProduction: boolean; isLocalhost: boolean },
): ApiConfigStatus {
  if (envBaseUrl) {
    const normalized = normalizeApiBaseUrl(envBaseUrl.value);
    return {
      configured: normalized.ok,
      baseUrl: normalized.value,
      source: envBaseUrl.source,
      isLocalhost: options.isLocalhost,
      isProduction: options.isProduction,
      code: normalized.code,
      message: normalized.message,
      fix: normalized.ok ? null : `Set ${envBaseUrl.source}=${EXPECTED_BACKEND_URL_EXAMPLE}. Include the https:// protocol, then rebuild/redeploy if the variable is NEXT_PUBLIC_*.`,
      expectedValue: EXPECTED_BACKEND_URL_EXAMPLE,
      hostname: normalized.hostname,
    };
  }

  if (options.allowLocalhostFallback) {
    const normalized = normalizeApiBaseUrl(DEFAULT_DEV_API_URL);
    return {
      configured: true,
      baseUrl: normalized.value,
      source: "localhost-default",
      isLocalhost: options.isLocalhost,
      isProduction: options.isProduction,
      code: null,
      message: null,
      fix: null,
      expectedValue: EXPECTED_BACKEND_URL_EXAMPLE,
      hostname: normalized.hostname,
    };
  }

  return {
    configured: false,
    baseUrl: null,
    source: "missing",
    isLocalhost: options.isLocalhost,
    isProduction: options.isProduction,
    code: "api-config-missing",
    message: SETUP_MESSAGE,
    fix: `Set NEXT_PUBLIC_API_BASE_URL=${EXPECTED_BACKEND_URL_EXAMPLE} on the Railway frontend service and rebuild/redeploy. Server routes may also set TRACKLY_API_BASE_URL at runtime.`,
    expectedValue: EXPECTED_BACKEND_URL_EXAMPLE,
    hostname: null,
  };
}

export function getApiSetupMessage(): string {
  return SETUP_MESSAGE;
}

export function getApiConfigStatus(): ApiConfigStatus {
  const envBaseUrl = configuredCurrentRuntimeEnvBaseUrl();
  const isProduction = process.env.NODE_ENV === "production";
  const isLocalhost = currentHostIsLocalhost();
  return statusFromEnv(envBaseUrl, {
    allowLocalhostFallback: isLocalhost || (!isProduction && typeof window === "undefined"),
    isLocalhost,
    isProduction,
  });
}

export function getServerApiConfigStatus(): ApiConfigStatus {
  const isProduction = process.env.NODE_ENV === "production";
  return statusFromEnv(configuredServerEnvBaseUrl(), {
    allowLocalhostFallback: !isProduction,
    isLocalhost: false,
    isProduction,
  });
}

export function isApiConfigured(): boolean {
  return getApiConfigStatus().configured;
}

export function getOptionalApiBaseUrl(): string | null {
  return getApiConfigStatus().baseUrl;
}

export function requireApiBaseUrl(): string {
  const status = getApiConfigStatus();
  if (!status.baseUrl) {
    throw new ApiConfigError(status.message ?? SETUP_MESSAGE, status.code ?? "api-config-missing");
  }
  return status.baseUrl;
}

export function requireServerApiBaseUrl(): string {
  const status = getServerApiConfigStatus();
  if (!status.baseUrl) {
    throw new ApiConfigError(status.message ?? SETUP_MESSAGE, status.code ?? "api-config-missing");
  }
  return status.baseUrl;
}

export function buildApiUrl(path: string): string {
  const baseUrl = requireApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export function getApiBaseUrl(): string {
  return requireApiBaseUrl();
}
