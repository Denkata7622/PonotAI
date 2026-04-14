import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../src/utils/asyncHandler.ts";

test("asyncHandler forwards rejected async controller errors to next()", async () => {
  const expected = new Error("db write failed");
  let forwarded: unknown;
  const wrapped = asyncHandler(async () => {
    throw expected;
  });

  const next: NextFunction = (error?: unknown) => {
    forwarded = error;
  };

  wrapped({} as Request, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(forwarded, expected);
});
