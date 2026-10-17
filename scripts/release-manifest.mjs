#!/usr/bin/env node
/**
 * Build or check root release.json against CORE_VERSION, kernel package.json
 * files (not the shop root package.json), plugins/tuucho/manifest.json, and
 * disk plugin.json files.
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
    if (entry.name === 'plugin.json') out.push(full);
  }
}

async function main() {
  const backPkg = JSON.parse(await readFile(join(root, 'kernel/back/package.json'), 'utf8'));
  const frontPkg = JSON.parse(await readFile(join(root, 'kernel/front/package.json'), 'utf8'));
  const coreFile = await readFile(join(root, 'kernel/back/src/modules/plugins/domain/coreVersion.ts'), 'utf8');
  const coreMatch = coreFile.match(/export const CORE_VERSION = '(\d+\.\d+\.\d+)'/);
  const kernel = coreMatch?.[1];
  if (!kernel) throw new Error('CORE_VERSION not found');
  if (backPkg.version !== kernel || frontPkg.version !== kernel) {
    throw new Error(
      `Version drift: kernel/back ${backPkg.version}, kernel/front ${frontPkg.version}, CORE_VERSION ${kernel}`,
    );
  }
  const bundled = JSON.parse(await readFile(join(root, 'plugins/tuucho/manifest.json'), 'utf8'));
  if (bundled.kernel !== kernel) {
    throw new Error(`plugins/tuucho/manifest.json kernel ${bundled.kernel} != ${kernel}`);
  }
  const migrationNames = (await readdir(join(root, 'kernel/back/src/db/migrations')))
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => name.replace(/\.js$/, ''));
  const jsonFiles = [];
  await walkPluginJson(join(root, 'plugins/tuucho'), jsonFiles);
  const diskPlugins = [];
  for (const file of jsonFiles.sort()) {
    const body = JSON.parse(await readFile(file, 'utf8'));
    diskPlugins.push({
      id: body.id,
      version: body.version,
      installPath: body.installPath,
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
  let releaseId = 9;
  try {
    const existing = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
    if (existing.kernel === kernel && typeof existing.releaseId === 'number') releaseId = existing.releaseId;
    else if (existing.kernel !== kernel && typeof existing.releaseId === 'number') {
      throw new Error(
        `Kernel is ${kernel} but release.json still has kernel ${existing.kernel} (releaseId ${existing.releaseId}). Increment releaseId when cutting the tag.`,
      );
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      if (String(error.message).includes('Increment releaseId')) throw error;
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
