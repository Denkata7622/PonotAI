import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import DownloadClient from "../app/download/DownloadClient";

test("download client server render does not touch browser-only APIs", () => {
  assert.doesNotThrow(() => renderToString(React.createElement(DownloadClient)));
});

test("download client renders downloader controls without backend API config", () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    server: process.env.TRACKLY_API_BASE_URL,
    node: process.env.NODE_ENV,
  };
  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.TRACKLY_API_BASE_URL;
    process.env.NODE_ENV = "production";

    const html = renderToString(React.createElement(DownloadClient));
    assert.match(html, /Local ZIP Export/);
    assert.match(html, /Export ZIP/);
    assert.match(html, /Downloader diagnostics/);
    assert.doesNotMatch(html, /Backend API URL is not configured.*blocks/);
  } finally {
    if (snapshot.base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = snapshot.base;
    if (snapshot.server === undefined) delete process.env.TRACKLY_API_BASE_URL;
    else process.env.TRACKLY_API_BASE_URL = snapshot.server;
    if (snapshot.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = snapshot.node;
  }
});
