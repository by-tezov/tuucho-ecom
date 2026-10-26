#!/usr/bin/env node
/** Write gitignored `.compose.env` from merged private JSON for Docker Compose. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const back = join(dirname(fileURLToPath(import.meta.url)), '..');
const shop = join(back, '../../..');
const target = process.env.APP_TARGET || 'dev';
const commonDir = join(shop, 'tuucho-config');

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function merge(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    out[key] =
      current && value && typeof current === 'object' && typeof value === 'object' && !Array.isArray(current) && !Array.isArray(value)
        ? merge(current, value)
        : value;
  }
  return out;
}

const envPrivate = existsSync(join(commonDir, `config.private.${target}.json`))
  ? join(commonDir, `config.private.${target}.json`)
  : join(commonDir, `config.private.${target}.example.json`);
if (!existsSync(envPrivate)) {
  console.error(`missing private JSON for APP_TARGET=${target} under tuucho-config/`);
  process.exit(1);
}
const json = merge(readJson(join(commonDir, 'config.private.json')), readJson(envPrivate));
const user = json.database?.user ?? '';
const password = json.database?.password ?? '';
const name = json.database?.name ?? '';
writeFileSync(
  join(back, '.compose.env'),
  `POSTGRES_USER=${user}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${name}\n`,
);
