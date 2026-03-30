#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const translationsTs = path.join(projectRoot, 'lib', 'translations.ts');
const localesDir = path.join(projectRoot, 'locales');

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractObjectBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;

  const braceStart = source.indexOf('{', markerIndex);
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(braceStart, i + 1);
    }
  }

  return null;
}

function extractTopLevelKeys(objectBlock) {
  if (!objectBlock) return new Set();
  const keys = new Set();

  const inner = objectBlock.slice(1, -1);
  let depth = 0;
  let current = '';

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === '{' || ch === '[') depth += 1;
    if (ch === '}' || ch === ']') depth -= 1;

    if (ch === ',' && depth === 0) {
      const keyMatch = current.match(/^\s*([A-Za-z0-9_]+)\s*:/);
      if (keyMatch) keys.add(keyMatch[1]);
      current = '';
      continue;
    }

    current += ch;
  }

  const lastMatch = current.match(/^\s*([A-Za-z0-9_]+)\s*:/);
  if (lastMatch) keys.add(lastMatch[1]);

  return keys;
}

function parseTsLocales() {
  const source = readFileSafe(translationsTs);
  if (!source) return {};

  const localeNames = ['en', 'bg'];
  const result = {};

  for (const locale of localeNames) {
    const block = extractObjectBlock(source, `${locale}:`);
    result[locale] = extractTopLevelKeys(block);
  }

  return result;
}

function flattenJsonKeys(obj, prefix = '') {
  const keys = new Set();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return keys;

  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of flattenJsonKeys(value, full)) keys.add(nested);
    } else {
      keys.add(full);
    }
  }

  return keys;
}

function parseJsonLocales() {
  if (!fs.existsSync(localesDir)) return {};
  const files = fs.readdirSync(localesDir).filter((name) => name.endsWith('.json'));
  const result = {};

  for (const file of files) {
    const locale = path.basename(file, '.json');
    const content = readFileSafe(path.join(localesDir, file));
    if (!content) continue;

    try {
      const parsed = JSON.parse(content);
      result[locale] = flattenJsonKeys(parsed);
    } catch (error) {
      console.error(`Invalid JSON in ${file}:`, error.message);
      process.exitCode = 2;
      return result;
    }
  }

  return result;
}

function toSortedArray(setLike) {
  return [...setLike].sort((a, b) => a.localeCompare(b));
}

function run() {
  const localeKeyMap = { ...parseTsLocales(), ...parseJsonLocales() };
  const locales = Object.keys(localeKeyMap).sort();

  if (locales.length === 0) {
    console.error('No locale dictionaries found. Checked: frontend/lib/translations.ts and frontend/locales/*.json');
    process.exit(2);
  }

  const allKeys = new Set();
  for (const locale of locales) {
    for (const key of localeKeyMap[locale]) {
      allKeys.add(key);
    }
  }

  let hasMissing = false;

  for (const locale of locales) {
    const missing = toSortedArray(new Set([...allKeys].filter((key) => !localeKeyMap[locale].has(key))));
    if (missing.length > 0) {
      hasMissing = true;
      console.log(`\n[${locale}] missing keys (${missing.length}):`);
      for (const key of missing) {
        console.log(`  - ${key}`);
      }
    }
  }

  if (hasMissing) {
    console.log('\n✗ i18n key check failed: missing translations detected.');
    process.exit(1);
  }

  console.log(`✓ i18n key check passed (${locales.length} locales, ${allKeys.size} unique keys).`);
}

run();
