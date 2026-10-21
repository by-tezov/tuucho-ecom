#!/usr/bin/env node
/**
 * Build or check tuucho/tuucho-versioning.json against the product version in
 * root package.json. Not Plugins Core / Check current. Run before tagging.
 *
 *   node scripts/tuucho-versioning.mjs           # write (create if missing)
 *   node scripts/tuucho-versioning.mjs --check   # fail on drift
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const CATALOG = join('tuucho', 'tuucho-versioning.json');
const LEGACY = ['tuucho-release.json', 'release.json'];
const COMMENT =
  'Check/Apply tag catalog generated from shop-root package.json (the only product version). Not Plugins Core or Check current. Historical GitHub tags may still use tuucho-release.json or release.json. Generate before tagging: node scripts/tuucho-versioning.mjs';

async function walkPluginJson(dir, out) {
  let names = [];
  try {
    names = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of names) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkPluginJson(full, out);
      continue;
    }
    if (entry.name === 'package.json') out.push(full);
  }
}

function assertNoProductVersion(pkg, label) {
  if (pkg && typeof pkg === 'object' && 'version' in pkg) {
    throw new Error(`${label} must not contain version; root package.json is the only product version`);
  }
}

async function readExistingCatalog() {
  for (const name of [CATALOG, ...LEGACY]) {
    try {
      return JSON.parse(await readFile(join(root, name), 'utf8'));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return null;
}

async function main() {
  const rootPkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const backPkg = JSON.parse(await readFile(join(root, 'tuucho/kernel/back/package.json'), 'utf8'));
  const frontPkg = JSON.parse(await readFile(join(root, 'tuucho/kernel/front/package.json'), 'utf8'));
  const sdkPkg = JSON.parse(await readFile(join(root, 'tuucho/plugin-sdk/package.json'), 'utf8'));
  const kernel = rootPkg.version;
  if (typeof kernel !== 'string' || !/^\d+\.\d+\.\d+$/.test(kernel)) {
    throw new Error('Root package.json must contain a MAJOR.MINOR.PATCH version');
  }
  assertNoProductVersion(backPkg, 'tuucho/kernel/back/package.json');
  assertNoProductVersion(frontPkg, 'tuucho/kernel/front/package.json');
  assertNoProductVersion(sdkPkg, 'tuucho/plugin-sdk/package.json');
  const bundledPath = join(root, 'tuucho/plugins/manifest.json');
  const bundled = JSON.parse(await readFile(bundledPath, 'utf8'));
  if (checkOnly && bundled.kernel !== kernel) {
    throw new Error(`tuucho/plugins/manifest.json kernel ${bundled.kernel} != ${kernel}`);
  }
  bundled.kernel = kernel;
  const migrationNames = (await readdir(join(root, 'tuucho/kernel/back/src/db/migrations')))
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => name.replace(/\.js$/, ''));
  const jsonFiles = [];
  await walkPluginJson(join(root, 'tuucho/plugins'), jsonFiles);
  const diskPlugins = [];
  for (const file of jsonFiles.sort()) {
    const body = JSON.parse(await readFile(file, 'utf8'));
    if (!body?.tuucho || typeof body.tuucho !== 'object') continue;
    diskPlugins.push({
      id: body.tuucho.id,
      version: body.version,
      installPath: body.tuucho.installPath,
    });
  }
  const bundledIds = new Set(bundled.plugins.map((row) => row.id));
  const diskIds = new Set(diskPlugins.map((row) => row.id));
  for (const id of bundledIds) {
    if (!diskIds.has(id)) throw new Error(`manifest.json lists ${id} missing on disk`);
  }
  for (const plugin of diskPlugins) {
    if (!bundledIds.has(plugin.id)) throw new Error(`disk plugin ${plugin.id} missing from manifest.json`);
    const listed = bundled.plugins.find((row) => row.id === plugin.id);
    if (listed.version !== plugin.version) {
      throw new Error(`${plugin.id} version ${plugin.version} != manifest ${listed.version}`);
    }
    if (
      !plugin.installPath?.startsWith('tuucho/plugins/') ||
      plugin.installPath.startsWith('tuucho/plugins/tuucho/') ||
      plugin.installPath.split('/').pop() !== plugin.id
    ) {
      throw new Error(`${plugin.id} installPath is invalid: ${plugin.installPath}`);
    }
  }
  let releaseId = 1;
  try {
    const existing = await readExistingCatalog();
    if (existing && existing.kernel === kernel && typeof existing.releaseId === 'number') {
      releaseId = existing.releaseId;
    } else if (existing && existing.kernel !== kernel && typeof existing.releaseId === 'number') {
      if (checkOnly) {
        throw new Error(
          `Kernel is ${kernel} but ${CATALOG} still has kernel ${existing.kernel} (releaseId ${existing.releaseId}). Run node scripts/tuucho-versioning.mjs`,
        );
      }
      releaseId = existing.releaseId + 1;
    }
  } catch (error) {
    if (error && typeof error === 'object' && String(error.message).includes(`${CATALOG} still has kernel`)) {
      throw error;
    }
  }
  const plugins = diskPlugins
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((plugin) => ({
      id: plugin.id,
      version: plugin.version,
      installPath: plugin.installPath,
    }));
  const manifest = {
    _comment: COMMENT,
    tag: kernel,
    kernel,
    releaseId,
    kernelMigrations: migrationNames,
    plugins,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (checkOnly) {
    let current;
    try {
      current = await readFile(join(root, CATALOG), 'utf8');
    } catch {
      throw new Error(`${CATALOG} is missing. Run node scripts/tuucho-versioning.mjs`);
    }
    if (current !== serialized) {
      throw new Error(`${CATALOG} is stale. Run node scripts/tuucho-versioning.mjs`);
    }
    return;
  }
  await mkdir(join(root, 'tuucho'), { recursive: true });
  await writeFile(join(root, CATALOG), serialized);
  for (const name of LEGACY) {
    await rm(join(root, name), { force: true });
  }
  await writeFile(bundledPath, `${JSON.stringify(bundled, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
