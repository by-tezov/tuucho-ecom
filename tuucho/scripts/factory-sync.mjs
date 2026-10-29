#!/usr/bin/env node
/**
 * Keep shipped factory templates identical to the live shop trees.
 *
 *   npm run factory-sync            # write tuucho/factory-backup from live
 *   npm run factory-sync:check      # fail on drift
 *
 * Live → factory:
 *   tuucho-config/  → tuucho/factory-backup/config/
 *   src/plugins/    → tuucho/factory-backup/plugins/
 *
 * Never copies live secrets (config.private.json / config.private.<env>.json).
 * Maps plugins.json → plugins.example.json. Never touches
 * tuucho/factory-backup/migrations/ when present (optional config:migrate steps).
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const checkOnly = process.argv.includes('--check');

const LIVE_CONFIG = join(root, 'tuucho-config');
const LIVE_PLUGINS = join(root, 'src/plugins');
const FACTORY_CONFIG = join(root, 'tuucho/factory-backup/config');
const FACTORY_PLUGINS = join(root, 'tuucho/factory-backup/plugins');

function isLivePrivate(base) {
  return /^config\.private(?:\.[a-z][a-z0-9-]*)?\.json$/.test(base) && !base.includes('example');
}

function shouldSkipLiveConfig(rel) {
  const posix = rel.replaceAll('\\', '/');
  const base = posix.split('/').pop() ?? '';
  if (posix === 'migrate-stamp.json') return true;
  if (isLivePrivate(base)) return true;
  return false;
}

function factoryConfigRel(liveRel) {
  const posix = liveRel.replaceAll('\\', '/');
  if (posix === 'plugins.json') return 'plugins.example.json';
  return posix;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir, rel = '') {
  const out = [];
  if (!(await pathExists(dir))) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full, childRel)));
      continue;
    }
    if (entry.isFile()) out.push(childRel.replaceAll('\\', '/'));
  }
  return out.sort();
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function collectConfigPlan() {
  const liveFiles = await walkFiles(LIVE_CONFIG);
  const plan = new Map();
  for (const liveRel of liveFiles) {
    if (shouldSkipLiveConfig(liveRel)) continue;
    plan.set(factoryConfigRel(liveRel), join(LIVE_CONFIG, liveRel));
  }
  return plan;
}

async function collectPluginsPlan() {
  const liveFiles = await walkFiles(LIVE_PLUGINS);
  const plan = new Map();
  for (const liveRel of liveFiles) {
    plan.set(liveRel, join(LIVE_PLUGINS, liveRel));
  }
  return plan;
}

async function diffPlan(plan, destRoot, { preservePrefixes = [] } = {}) {
  const missing = [];
  const different = [];
  const unexpected = [];
  for (const [rel, sourcePath] of plan) {
    const destPath = join(destRoot, rel);
    if (!(await pathExists(destPath))) {
      missing.push(rel);
      continue;
    }
    if ((await sha256(sourcePath)) !== (await sha256(destPath))) different.push(rel);
  }
  for (const rel of await walkFiles(destRoot)) {
    if (preservePrefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
    if (!plan.has(rel)) unexpected.push(rel);
  }
  return { missing, different, unexpected };
}

async function writePlan(plan, destRoot, { preservePrefixes = [], wipeUnlisted = true } = {}) {
  const logs = [];
  if (wipeUnlisted) {
    for (const rel of await walkFiles(destRoot)) {
      if (preservePrefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
      if (plan.has(rel)) continue;
      await rm(join(destRoot, rel), { force: true });
      logs.push(`remove ${relative(root, join(destRoot, rel))}`);
    }
  }
  for (const [rel, sourcePath] of plan) {
    const destPath = join(destRoot, rel);
    const same = (await pathExists(destPath)) && (await sha256(sourcePath)) === (await sha256(destPath));
    if (same) continue;
    await mkdir(dirname(destPath), { recursive: true });
    await cp(sourcePath, destPath);
    logs.push(`write ${relative(root, destPath)}`);
  }
  return logs;
}

async function pruneEmptyDirs(dir, { preserveNames = [] } = {}) {
  if (!(await pathExists(dir))) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (preserveNames.includes(entry.name)) continue;
    const full = join(dir, entry.name);
    await pruneEmptyDirs(full, { preserveNames: [] });
    const left = await readdir(full);
    if (left.length === 0) await rm(full, { recursive: true, force: true });
  }
}

async function main() {
  if (!(await pathExists(FACTORY_CONFIG))) {
    throw new Error(`missing ${relative(root, FACTORY_CONFIG)}`);
  }
  if (!(await pathExists(LIVE_CONFIG))) {
    if (checkOnly) {
      console.log(
        'factory-sync:check skipped: no local tuucho-config/ (operator tree). Shipped templates are tuucho/factory-backup/config/.',
      );
      return;
    }
    throw new Error(`missing ${relative(root, LIVE_CONFIG)} (run npm run config:migrate / setup first)`);
  }
  if (!(await pathExists(LIVE_PLUGINS))) {
    if (checkOnly) {
      console.log(
        'factory-sync:check skipped: no local src/plugins/ (operator tree). Shipped examples are tuucho/factory-backup/plugins/.',
      );
      return;
    }
    throw new Error(`missing ${relative(root, LIVE_PLUGINS)} (run npm run config:migrate / setup first)`);
  }

  const configPlan = await collectConfigPlan();
  const pluginsPlan = await collectPluginsPlan();

  if (checkOnly) {
    const configDiff = await diffPlan(configPlan, FACTORY_CONFIG);
    const pluginsDiff = await diffPlan(pluginsPlan, FACTORY_PLUGINS);
    const problems = [];
    for (const rel of configDiff.missing) problems.push(`missing config/${rel}`);
    for (const rel of configDiff.different) problems.push(`stale config/${rel}`);
    for (const rel of configDiff.unexpected) problems.push(`extra config/${rel}`);
    for (const rel of pluginsDiff.missing) problems.push(`missing plugins/${rel}`);
    for (const rel of pluginsDiff.different) problems.push(`stale plugins/${rel}`);
    for (const rel of pluginsDiff.unexpected) problems.push(`extra plugins/${rel}`);
    if (problems.length > 0) {
      console.error(`factory-backup is out of sync (${problems.length}):`);
      for (const line of problems) console.error(`- ${line}`);
      console.error('Run: npm run factory-sync');
      process.exit(1);
    }
    console.log(
      `factory-backup in sync (${configPlan.size} config files, ${pluginsPlan.size} plugin files).`,
    );
    return;
  }

  await mkdir(FACTORY_CONFIG, { recursive: true });
  await mkdir(FACTORY_PLUGINS, { recursive: true });
  const logs = [
    ...(await writePlan(configPlan, FACTORY_CONFIG)),
    ...(await writePlan(pluginsPlan, FACTORY_PLUGINS)),
  ];
  await pruneEmptyDirs(FACTORY_CONFIG);
  await pruneEmptyDirs(FACTORY_PLUGINS);
  for (const line of logs) console.log(`[factory-sync] ${line}`);
  console.log(
    logs.length === 0
      ? '[factory-sync] already in sync'
      : `[factory-sync] wrote ${logs.length} change(s)`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
