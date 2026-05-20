import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/runtime-diagnostics/route";

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
