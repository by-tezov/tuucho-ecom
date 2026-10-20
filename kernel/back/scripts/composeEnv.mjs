#!/usr/bin/env node
/** Write gitignored `.compose.env` from merged private JSON for Docker Compose. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.APP_TARGET || 'dev';
const commonDir = join(root, 'config');
const envDir = join(commonDir, target);

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

const commonPrivate = existsSync(join(commonDir, 'config.private.json'))
  ? join(commonDir, 'config.private.json')
  : join(commonDir, 'config.private.example.json');
const envPrivate = existsSync(join(envDir, 'config.private.json'))
  ? join(envDir, 'config.private.json')
  : join(envDir, 'config.private.example.json');
if (!existsSync(commonPrivate) || !existsSync(envPrivate)) {
  console.error(`missing private JSON for APP_TARGET=${target} under config/`);
  process.exit(1);
}
const json = merge(readJson(commonPrivate), readJson(envPrivate));
const user = json.database?.user ?? '';
const password = json.database?.password ?? '';
const name = json.database?.name ?? '';
writeFileSync(
  join(root, '.compose.env'),
  `POSTGRES_USER=${user}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${name}\n`,
);
