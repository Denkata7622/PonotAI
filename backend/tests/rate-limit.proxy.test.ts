import test from "node:test";
import assert from "node:assert/strict";
import { resolveTrustProxySetting } from "../src/config/trustProxy.ts";

test("trust proxy defaults to first proxy hop in production", () => {
  const prevNode = process.env.NODE_ENV;
  const prevTrustProxy = process.env.TRUST_PROXY;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.TRUST_PROXY;
    assert.equal(resolveTrustProxySetting(), 1);
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prevTrustProxy;
  }
});

test("trust proxy honors explicit TRUST_PROXY override", () => {
  const prevNode = process.env.NODE_ENV;
  const prevTrustProxy = process.env.TRUST_PROXY;

  try {
    process.env.NODE_ENV = "production";
    process.env.TRUST_PROXY = "false";
    assert.equal(resolveTrustProxySetting(), false);

    process.env.TRUST_PROXY = "2";
    assert.equal(resolveTrustProxySetting(), 2);
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prevTrustProxy;
  }
});
