/**
 * Centralized API configuration.
 *
 * Safe helpers never throw and are suitable during render. Strict helpers throw
 * typed setup errors and should only be used from API/event code paths.
 */

const DEFAULT_DEV_API_URL = "http://localhost:4000";
const SETUP_MESSAGE = "Backend API URL is not configured. Set NEXT_PUBLIC_API_BASE_URL on the frontend service and redeploy.";

export type ApiConfigErrorCode = "api-config-missing";

export class ApiConfigError extends Error {
  code: ApiConfigErrorCode;
  setupMessage: string;

  constructor(message = SETUP_MESSAGE) {
    super(message);
    this.name = "ApiConfigError";
    this.code = "api-config-missing";
    this.setupMessage = message;
  }
}

export type ApiConfigStatus = {
  configured: boolean;
  baseUrl: string | null;
  source: "NEXT_PUBLIC_API_BASE_URL" | "NEXT_PUBLIC_API_URL" | "localhost-default" | "missing";
  isLocalhost: boolean;
  isProduction: boolean;
  message: string | null;
};

function normalize(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function currentHostIsLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  return isLocalhostHost(window.location?.hostname ?? "");
}

function configuredEnvBaseUrl(): { value: string; source: ApiConfigStatus["source"] } | null {
  const primary = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (primary) return { value: primary, source: "NEXT_PUBLIC_API_BASE_URL" };
  const legacy = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (legacy) return { value: legacy, source: "NEXT_PUBLIC_API_URL" };
  return null;
}

export function getApiSetupMessage(): string {
  return SETUP_MESSAGE;
}

export function getApiConfigStatus(): ApiConfigStatus {
  const envBaseUrl = configuredEnvBaseUrl();
  const isProduction = process.env.NODE_ENV === "production";
  const isLocalhost = currentHostIsLocalhost();

  if (envBaseUrl) {
    return {
      configured: true,
      baseUrl: normalize(envBaseUrl.value),
      source: envBaseUrl.source,
      isLocalhost,
      isProduction,
      message: null,
    };
  }

  if (isLocalhost || (!isProduction && typeof window === "undefined")) {
    return {
      configured: true,
      baseUrl: normalize(DEFAULT_DEV_API_URL),
      source: "localhost-default",
      isLocalhost: isLocalhost || typeof window === "undefined",
      isProduction,
      message: null,
    };
  }

  return {
    configured: false,
    baseUrl: null,
    source: "missing",
    isLocalhost,
    isProduction,
    message: SETUP_MESSAGE,
  };
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
    throw new ApiConfigError(status.message ?? SETUP_MESSAGE);
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
