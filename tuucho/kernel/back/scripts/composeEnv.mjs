#!/usr/bin/env node
/**
 * Write gitignored Compose env (POSTGRES_*) from merged private JSON.
 * Target: `<outputDir>/docker/.compose.env` (default `<shopRoot>/output/...`),
 * never under `tuucho/`.
 *
 *   node scripts/composeEnv.mjs          # write file, print absolute path
 *   node scripts/composeEnv.mjs --path   # print path only (no write)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const back = join(dirname(fileURLToPath(import.meta.url)), '..');
const shop = join(back, '../../..');
const target = process.env.APP_TARGET || 'dev';
const shopConfig = join(shop, 'tuucho-config');
const kernelTree = existsSync(join(shopConfig, 'kernel', 'config.json'))
  ? join(shopConfig, 'kernel')
  : shopConfig;
const pathOnly = process.argv.includes('--path');

export function composeEnvFile(shopRoot = shop) {
  const raw = process.env.OUTPUT_DIR?.trim();
  const outputDir = raw ? resolve(shopRoot, raw) : join(shopRoot, 'output');
  return join(outputDir, 'docker', '.compose.env');
}

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

export function writeComposeEnv(shopRoot = shop) {
  const privatePath = resolveEnvPrivate(kernelTree, target);
  const envPrivate = firstExisting(privatePath, exampleSibling(privatePath));
  if (!envPrivate) {
    throw new Error(`missing private JSON for APP_TARGET=${target} under tuucho-config/kernel/`);
  }
  const json = merge(readJson(join(kernelTree, 'config.private.json')), readJson(envPrivate));
  const user = json.database?.user ?? '';
  const password = json.database?.password ?? '';
  const name = json.database?.name ?? '';
  const dest = composeEnvFile(shopRoot);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `POSTGRES_USER=${user}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${name}\n`);
  return dest;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    if (pathOnly) {
      console.log(composeEnvFile());
    } else {
      console.log(writeComposeEnv());
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
