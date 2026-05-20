import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiConfigError,
  buildApiUrl,
  getApiConfigStatus,
  getOptionalApiBaseUrl,
  requireApiBaseUrl,
} from "../lib/apiConfig";

function restoreEnv(snapshot: { base?: string; alt?: string; node?: string }) {
  if (snapshot.base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = snapshot.base;
  if (snapshot.alt === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = snapshot.alt;
  if (snapshot.node === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = snapshot.node;
}

test("safe API config status does not throw when production env is missing", () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    alt: process.env.NEXT_PUBLIC_API_URL,
    node: process.env.NODE_ENV,
  };
  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NODE_ENV = "production";

    const status = getApiConfigStatus();
    assert.equal(status.configured, false);
    assert.equal(status.baseUrl, null);
    assert.match(status.message ?? "", /NEXT_PUBLIC_API_BASE_URL/);
    assert.equal(getOptionalApiBaseUrl(), null);
  } finally {
    restoreEnv(snapshot);
  }
});

test("strict API config helper throws a typed setup error", () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    alt: process.env.NEXT_PUBLIC_API_URL,
    node: process.env.NODE_ENV,
  };
  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NODE_ENV = "production";

    assert.throws(() => requireApiBaseUrl(), (error: unknown) => {
      assert.ok(error instanceof ApiConfigError);
      assert.equal(error.code, "api-config-missing");
      return true;
    });
  } finally {
    restoreEnv(snapshot);
  }
});

test("api config keeps localhost fallback in development server runtime", () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    alt: process.env.NEXT_PUBLIC_API_URL,
    node: process.env.NODE_ENV,
  };
  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NODE_ENV = "development";

    assert.equal(requireApiBaseUrl(), "http://localhost:4000");
  } finally {
    restoreEnv(snapshot);
  }
});

test("buildApiUrl handles leading and trailing slashes", () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    alt: process.env.NEXT_PUBLIC_API_URL,
    node: process.env.NODE_ENV,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test/";
    delete process.env.NEXT_PUBLIC_API_URL;

    assert.equal(buildApiUrl("/api/auth/me"), "https://api.example.test/api/auth/me");
    assert.equal(buildApiUrl("api/auth/me"), "https://api.example.test/api/auth/me");
  } finally {
    restoreEnv(snapshot);
  }
});

test("api config strips credentials, query, and hash from public base URL", () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    alt: process.env.NEXT_PUBLIC_API_URL,
    node: process.env.NODE_ENV,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://user:secret@api.example.test/base?token=secret#frag";
    delete process.env.NEXT_PUBLIC_API_URL;

    const status = getApiConfigStatus();
    assert.equal(status.baseUrl, "https://api.example.test/base");
    assert.doesNotMatch(JSON.stringify(status), /secret|token=|user:/);
  } finally {
    restoreEnv(snapshot);
  }
});
