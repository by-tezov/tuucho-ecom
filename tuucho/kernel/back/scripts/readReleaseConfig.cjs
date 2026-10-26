#!/usr/bin/env node
/** Read one kernel JSON path or plugin setting from a deployed release.
 * Usage: node readReleaseConfig.cjs paths.privateDir
 *        node readReleaseConfig.cjs --plugin tuucho-contact forwardRecipient
 * Prints only the requested value. Never dumps the document. */
'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    out[key] = isObject(current) && isObject(value) ? merge(current, value) : value;
  }
  return out;
}

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function getPath(obj, path) {
  let current = obj;
  for (const part of path.split('.')) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

function printValue(value) {
  if (value === undefined || value === null) return;
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    process.stdout.write(String(value));
  }
}

const here = __dirname;
const releaseDir =
  process.env.TUCHO_RELEASE_DIR ||
  (existsSync(join(here, 'config', 'config.json')) ? here : join(here, '..'));
const target = process.env.APP_TARGET || 'prod';
const commonDir = join(releaseDir, 'config');

function loadMerged() {
  const commonPrivate = existsSync(join(commonDir, 'config.private.json'))
    ? join(commonDir, 'config.private.json')
    : join(commonDir, 'config.private.example.json');
  const envPrivate = existsSync(join(commonDir, `config.private.${target}.json`))
    ? join(commonDir, `config.private.${target}.json`)
    : join(commonDir, `config.private.${target}.example.json`);
  const merged = merge(
    merge(
      merge(readJson(join(commonDir, 'config.json')), readJson(join(commonDir, `config.${target}.json`))),
      readJson(commonPrivate),
    ),
    readJson(envPrivate),
  );
  if (process.env.DATABASE_URL) {
    merged.database = { ...(isObject(merged.database) ? merged.database : {}), url: process.env.DATABASE_URL };
  }
  return merged;
}

async function main() {
  const args = process.argv.slice(2);
  const merged = loadMerged();
  if (args[0] === '--plugin') {
    const pluginId = args[1];
    const key = args[2];
    if (!pluginId || !key) process.exit(1);
    const url = typeof merged.database?.url === 'string' ? merged.database.url : '';
    if (!url) process.exit(1);
    const { Client } = require('pg');
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const result = await client.query(`select coalesce(settings->>$2, '') as value from plugins where id = $1`, [
        pluginId,
        key,
      ]);
      printValue(result.rows[0]?.value || '');
    } finally {
      await client.end();
    }
    return;
  }
  const path = args[0];
  if (!path) process.exit(1);
  printValue(getPath(merged, path));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message.replace(/postgres:\/\/[^@\s]+@/g, 'postgres://***@')}\n`);
  process.exit(1);
});
