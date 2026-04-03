#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const localeSearchDirs = [
  path.join(projectRoot, "src", "locales"),
  path.join(projectRoot, "src", "i18n"),
  path.join(projectRoot, "locales"),
];

const translationsTs = path.join(projectRoot, "lib", "translations.ts");

function walkJsonFiles(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;

  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        out.push(full);
      }
    }
  }

  return out;
}

function flattenKeys(obj, prefix = "") {
  const keys = new Set();
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return keys;

  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of flattenKeys(value, full)) keys.add(nested);
    } else {
      keys.add(full);
    }
  }

  return keys;
}

function extractLocaleNameFromPath(filePath) {
  const base = path.basename(filePath, ".json");
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(base)) return base;

  const parent = path.basename(path.dirname(filePath));
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(parent)) return parent;

  return base;
}

function parseJsonLocales() {
  const localeMap = new Map();

  for (const dir of localeSearchDirs) {
    for (const file of walkJsonFiles(dir)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        const locale = extractLocaleNameFromPath(file);
        const keys = flattenKeys(parsed);
        if (!localeMap.has(locale)) localeMap.set(locale, new Set());
        for (const key of keys) localeMap.get(locale).add(key);
      } catch (error) {
        console.error(`Invalid JSON in ${file}: ${error.message}`);
        process.exit(2);
      }
    }
  }

  return localeMap;
}

function extractObjectBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;
  const braceStart = source.indexOf("{", markerIndex);
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) return source.slice(braceStart, i + 1);
  }

  return null;
}

function extractTopLevelKeys(objectBlock) {
  if (!objectBlock) return new Set();
  const inner = objectBlock.slice(1, -1);
  const keys = new Set();

  const matches = inner.matchAll(/\n\s*([a-zA-Z0-9_]+)\s*:/g);
  for (const match of matches) keys.add(match[1]);
  return keys;
}

function parseTranslationsTsFallback() {
  if (!fs.existsSync(translationsTs)) return new Map();
  const source = fs.readFileSync(translationsTs, "utf8");

  const localeMap = new Map();
  for (const locale of ["en", "bg"]) {
    const block = extractObjectBlock(source, `${locale}:`);
    const keys = extractTopLevelKeys(block);
    if (keys.size > 0) localeMap.set(locale, keys);
  }
  return localeMap;
}

function sorted(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b));
}

function run() {
  const localeMap = parseJsonLocales();

  if (localeMap.size === 0) {
    const fallback = parseTranslationsTsFallback();
    for (const [locale, keys] of fallback.entries()) localeMap.set(locale, keys);
  }

  if (localeMap.size === 0) {
    console.error("No locale dictionaries found. Checked JSON locales and frontend/lib/translations.ts.");
    process.exit(2);
  }

  const locales = sorted(localeMap.keys());
  const allKeys = new Set();
  for (const locale of locales) {
    for (const key of localeMap.get(locale)) allKeys.add(key);
  }

  let hasMissing = false;
  for (const locale of locales) {
    const keys = localeMap.get(locale);
    const missing = sorted([...allKeys].filter((k) => !keys.has(k)));
    if (missing.length > 0) {
      hasMissing = true;
      console.log(`\n[${locale}] missing keys (${missing.length})`);
      for (const key of missing) console.log(`  - ${key}`);
    }
  }

  if (hasMissing) {
    console.log("\n✗ i18n key check failed.");
    process.exit(1);
  }

  console.log(`✓ i18n key check passed (${locales.length} locales, ${allKeys.size} keys).`);
}

run();
