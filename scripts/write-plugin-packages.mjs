#!/usr/bin/env node
/**
 * Generate plugin package.json stubs from plugin.json.
 *
 * plugin.json is the only human-edited plugin manifest (id, version,
 * description, installPath, repository, …). package.json is npm workspace
 * plumbing: private, name derived from id, dependency on @tuucho/plugin-sdk.
 * No version, no description, no duplicated plugin.json fields.
 *
 *   node scripts/write-plugin-packages.mjs           # write
 *   node scripts/write-plugin-packages.mjs --check   # fail on drift / hand-edited version
 *
 * `npm install` at the repo root runs this via preinstall.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const PLUGIN_TREES = [join(root, 'plugins/tuucho'), join(root, 'plugins/user')];
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'coverage']);

function pluginPackageName(id) {
  return `@tuucho/plugin-${id}`;
}

function pluginSdkSpec(pluginDir) {
  const rel = relative(pluginDir, join(root, 'plugin-sdk')).replaceAll('\\', '/');
  return `file:${rel.startsWith('.') ? rel : `./${rel}`}`;
}

function stubJson(id, pluginDir) {
  return `${JSON.stringify(
    {
      name: pluginPackageName(id),
      private: true,
      type: 'module',
      dependencies: {
        '@tuucho/plugin-sdk': pluginSdkSpec(pluginDir),
      },
    },
    null,
    2,
  )}\n`;
}

function forbiddenReason(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'version' in body) {
    return 'has a version field (plugin version lives in plugin.json only)';
  }
  if (body && typeof body === 'object' && !Array.isArray(body) && 'description' in body) {
    return 'has a description field (description lives in plugin.json only)';
  }
  return null;
}

async function walkPluginJson(dir, out) {
  let names = [];
  try {
    names = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of names) {
    if (entry.name.startsWith('.') || SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkPluginJson(full, out);
      continue;
    }
    if (entry.name === 'plugin.json') out.push(full);
  }
}

async function main() {
  const jsonFiles = [];
  for (const tree of PLUGIN_TREES) await walkPluginJson(tree, jsonFiles);
  jsonFiles.sort();
  if (jsonFiles.length === 0) throw new Error('No plugin.json files found under plugins/');

  const drift = [];
  for (const file of jsonFiles) {
    const pluginDir = dirname(file);
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const id = typeof manifest.id === 'string' ? manifest.id : '';
    if (!id) throw new Error(`${file} is missing id`);
    const expected = stubJson(id, pluginDir);
    const packagePath = join(pluginDir, 'package.json');
    let current = '';
    try {
      current = await readFile(packagePath, 'utf8');
    } catch {
      current = '';
    }
    if (checkOnly) {
      if (!current) {
        drift.push(`${relative(root, packagePath)} is missing. Run node scripts/write-plugin-packages.mjs`);
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(current);
      } catch {
        drift.push(`${relative(root, packagePath)} is not JSON`);
        continue;
      }
      const reason = forbiddenReason(parsed);
      if (reason) drift.push(`${relative(root, packagePath)} ${reason}`);
      if (current !== expected) {
        drift.push(`${relative(root, packagePath)} is stale. Run node scripts/write-plugin-packages.mjs`);
      }
      continue;
    }
    if (current !== expected) await writeFile(packagePath, expected);
  }

  if (checkOnly && drift.length > 0) {
    throw new Error(drift.join('\n'));
  }
  if (!checkOnly) {
    console.log(`wrote ${jsonFiles.length} plugin package.json stubs`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
