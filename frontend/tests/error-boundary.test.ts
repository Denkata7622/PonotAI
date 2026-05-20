import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import ErrorBoundary from "../app/error";

test("app error boundary renders fallback with diagnostic copy", () => {
  const html = renderToString(React.createElement(ErrorBoundary, {
    error: Object.assign(new Error("boom"), { digest: "digest-123" }),
    reset: () => undefined,
  }));

  assert.match(html, /This view could not load/);
  assert.match(html, /digest-123/);
  assert.doesNotMatch(html, /stack/);
});
