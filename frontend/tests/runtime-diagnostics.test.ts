import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/runtime-diagnostics/route";
import { GET as GET_RUNTIME_CONFIG } from "../app/api/runtime-config/route";

test("runtime diagnostics reports missing frontend API URL safely", async () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    alt: process.env.NEXT_PUBLIC_API_URL,
    node: process.env.NODE_ENV,
  };
  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NODE_ENV = "production";

    const response = await GET();
    const body = await response.json() as {
      api: { configured: boolean; backendOrigin: string | null };
      warnings: string[];
      fixes: string[];
    };

    assert.equal(body.api.configured, false);
    assert.equal(body.api.backendOrigin, null);
    assert.match(body.warnings.join(" "), /NEXT_PUBLIC_API_BASE_URL/);
    assert.match(body.fixes.join(" "), /rebuild\/redeploy/);
  } finally {
    if (snapshot.base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = snapshot.base;
    if (snapshot.alt === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = snapshot.alt;
    if (snapshot.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = snapshot.node;
  }
});

test("runtime config reports public and server backend URL status safely", async () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    alt: process.env.NEXT_PUBLIC_API_URL,
    server: process.env.TRACKLY_API_BASE_URL,
    node: process.env.NODE_ENV,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_API_BASE_URL = "trackly-production-6ec0.up.railway.app";
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.TRACKLY_API_BASE_URL = "https://trackly-production-6ec0.up.railway.app/";

    const response = await GET_RUNTIME_CONFIG();
    const body = await response.json() as {
      publicBuild: { configured: boolean; code: string | null; message: string | null; hostname: string | null };
      serverRuntime: { configured: boolean; hostname: string | null };
      expectedBackendUrlShape: string;
    };

    assert.equal(body.publicBuild.configured, false);
    assert.equal(body.publicBuild.code, "api-config-invalid");
    assert.match(body.publicBuild.message ?? "", /https:\/\//);
    assert.equal(body.publicBuild.hostname, null);
    assert.equal(body.serverRuntime.configured, true);
    assert.equal(body.serverRuntime.hostname, "trackly-production-6ec0.up.railway.app");
    assert.equal(body.expectedBackendUrlShape, "https://trackly-production-6ec0.up.railway.app");
    assert.doesNotMatch(JSON.stringify(body), /secret|token|password/i);
  } finally {
    if (snapshot.base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = snapshot.base;
    if (snapshot.alt === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = snapshot.alt;
    if (snapshot.server === undefined) delete process.env.TRACKLY_API_BASE_URL;
    else process.env.TRACKLY_API_BASE_URL = snapshot.server;
    if (snapshot.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = snapshot.node;
  }
});
