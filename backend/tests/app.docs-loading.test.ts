import test from "node:test";
import assert from "node:assert/strict";
import { loadOpenApiSpec } from "../src/app";

test("loadOpenApiSpec returns missing status when openapi asset is absent", () => {
  const result = loadOpenApiSpec(["/tmp/trackly-openapi-missing.yaml"]);
  assert.equal(result.status, "missing");
});
