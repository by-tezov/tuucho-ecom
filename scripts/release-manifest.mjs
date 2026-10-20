#!/usr/bin/env node
/**
 * Build or check root release.json against the product version in root
 * package.json. kernel/back, kernel/front, plugin-sdk, CORE_VERSION (which
 * reads that root version), plugins/tuucho/manifest.json, and disk plugin
 * package.json files (npm version + tuucho block) must not be a second product
 * version. Plugin package versions are per-plugin.
 *
 * Check / Apply walk official GitHub tags. Displayed current is live root
 * package.json; this file is the tag catalog. shop-release.json is last-applied
 * Apply state, not the Check current.
 *
 *   node scripts/release-manifest.mjs           # write
 *   node scripts/release-manifest.mjs --check   # fail on drift
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

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

async function main() {
  const rootPkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const backPkg = JSON.parse(await readFile(join(root, 'kernel/back/package.json'), 'utf8'));
  const frontPkg = JSON.parse(await readFile(join(root, 'kernel/front/package.json'), 'utf8'));
  const sdkPkg = JSON.parse(await readFile(join(root, 'plugin-sdk/package.json'), 'utf8'));
  const kernel = rootPkg.version;
  if (typeof kernel !== 'string' || !/^\d+\.\d+\.\d+$/.test(kernel)) {
    throw new Error('Root package.json must contain a MAJOR.MINOR.PATCH version');
  }
  assertNoProductVersion(backPkg, 'kernel/back/package.json');
  assertNoProductVersion(frontPkg, 'kernel/front/package.json');
  assertNoProductVersion(sdkPkg, 'plugin-sdk/package.json');
  const bundledPath = join(root, 'plugins/tuucho/manifest.json');
  const bundled = JSON.parse(await readFile(bundledPath, 'utf8'));
  if (checkOnly && bundled.kernel !== kernel) {
    throw new Error(`plugins/tuucho/manifest.json kernel ${bundled.kernel} != ${kernel}`);
  }
  bundled.kernel = kernel;
  const migrationNames = (await readdir(join(root, 'kernel/back/src/db/migrations')))
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => name.replace(/\.js$/, ''));
  const jsonFiles = [];
  await walkPluginJson(join(root, 'plugins/tuucho'), jsonFiles);
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
    if (!plugin.installPath?.startsWith('plugins/tuucho/') || plugin.installPath.split('/').pop() !== plugin.id) {
      throw new Error(`${plugin.id} installPath is invalid: ${plugin.installPath}`);
    }
  }
  let releaseId = 1;
  try {
    const existing = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
    if (existing.kernel === kernel && typeof existing.releaseId === 'number') releaseId = existing.releaseId;
    else if (existing.kernel !== kernel && typeof existing.releaseId === 'number') {
      if (checkOnly) {
        throw new Error(
          `Kernel is ${kernel} but release.json still has kernel ${existing.kernel} (releaseId ${existing.releaseId}). Run node scripts/release-manifest.mjs`,
        );
      }
      releaseId = existing.releaseId + 1;
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      if (String(error.message).includes('release.json still has kernel')) throw error;
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
      current = await readFile(join(root, 'release.json'), 'utf8');
    } catch {
      throw new Error('release.json is missing. Run node scripts/release-manifest.mjs');
    }
    if (current !== serialized) {
      throw new Error('release.json is stale. Run node scripts/release-manifest.mjs');
    }
    return;
  }
  await writeFile(join(root, 'release.json'), serialized);
  await writeFile(bundledPath, `${JSON.stringify(bundled, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
