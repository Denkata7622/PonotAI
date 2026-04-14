import test from "node:test";
import assert from "node:assert/strict";
import { getApiBaseUrl } from "../lib/apiConfig";

test("api config requires explicit backend url in production server runtime", () => {
  const prevBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const prevAlt = process.env.NEXT_PUBLIC_API_URL;
  const prevNode = process.env.NODE_ENV;

  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NODE_ENV = "production";

    assert.throws(() => getApiBaseUrl(), /NEXT_PUBLIC_API_BASE_URL/);
  } finally {
    if (prevBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = prevBase;

    if (prevAlt === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = prevAlt;

    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  }
});

test("api config keeps localhost fallback in development", () => {
  const prevBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const prevAlt = process.env.NEXT_PUBLIC_API_URL;
  const prevNode = process.env.NODE_ENV;

  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NODE_ENV = "development";

    assert.equal(getApiBaseUrl(), "http://localhost:4000");
  } finally {
    if (prevBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = prevBase;

    if (prevAlt === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = prevAlt;

    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  }
});
