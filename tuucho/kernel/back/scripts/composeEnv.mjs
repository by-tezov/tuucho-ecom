#!/usr/bin/env node
/** Write gitignored `.compose.env` from merged private JSON for Docker Compose. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const back = join(dirname(fileURLToPath(import.meta.url)), '..');
const shop = join(back, '../../..');
const target = process.env.APP_TARGET || 'dev';
const shopConfig = join(shop, 'tuucho-config');
const kernelTree = existsSync(join(shopConfig, 'kernel', 'config.json'))
  ? join(shopConfig, 'kernel')
  : shopConfig;

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function merge(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    out[key] =
      current &&
      value &&
      typeof current === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(current) &&
      !Array.isArray(value)
        ? merge(current, value)
        : value;
  }
  return out;
}

function resolveTreeRelative(treeRoot, relativePath) {
  const raw = String(relativePath).trim().replaceAll('\\', '/');
  if (!raw || raw.startsWith('/') || raw.split('/').includes('..')) return null;
  const resolved = resolve(treeRoot, raw);
  const root = resolve(treeRoot);
  if (resolved !== root && !resolved.startsWith(root + sep)) return null;
  return resolved;
}

function exampleSibling(filePath) {
  if (filePath.endsWith('.example.json')) return filePath;
  if (filePath.endsWith('.json')) return `${filePath.slice(0, -'.json'.length)}.example.json`;
  return `${filePath}.example.json`;
}

function firstExisting(...candidates) {
  return candidates.find((path) => path && existsSync(path));
}

function resolveEnvPrivate(treeRoot, env) {
  const common = readJson(join(treeRoot, 'config.json'));
  const layer = common?.environments?.[env];
  if (layer && typeof layer.private === 'string') {
    const declared = resolveTreeRelative(treeRoot, layer.private);
    if (declared) return declared;
  }
  const candidates = [
    join(treeRoot, env, 'config.private.json'),
    join(treeRoot, `config.private.${env}.json`),
  ];
  const existing = firstExisting(...candidates);
  if (existing) return existing;
  for (const candidate of candidates) {
    if (existsSync(exampleSibling(candidate))) return candidate;
  }
  return candidates[0];
}

const privatePath = resolveEnvPrivate(kernelTree, target);
const envPrivate = firstExisting(privatePath, exampleSibling(privatePath));
if (!envPrivate) {
  console.error(`missing private JSON for APP_TARGET=${target} under tuucho-config/kernel/`);
  process.exit(1);
}
const json = merge(readJson(join(kernelTree, 'config.private.json')), readJson(envPrivate));
const user = json.database?.user ?? '';
const password = json.database?.password ?? '';
const name = json.database?.name ?? '';
writeFileSync(
  join(back, '.compose.env'),
  `POSTGRES_USER=${user}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${name}\n`,
);
