#!/usr/bin/env node
/**
 * Copies the API payload contract to the front, and verifies it has not
 * drifted.
 *
 * `src/contract/` is the one description of the shapes this API sends and
 * accepts. The backend compiles against it; the front consumes the generated
 * copy instead of hand-writing its own idea of each response. Before this,
 * both repositories typechecked green while disagreeing about a field, and
 * only the browser found out.
 *
 * `--check` (used by `npm run check:contract`) fails when the front copy is
 * stale or was edited by hand. Edit `src/contract/` and re-run the sync.
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';

const root = resolve('.');
const source = resolve(root, 'src/contract');
const frontRoot = resolve(root, '../front');
const target = resolve(frontRoot, 'src/api/contract');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : extname(entry.name) === '.ts' ? [path] : [];
    }),
  );
  return nested.flat();
}

/** The backend uses NodeNext resolution and writes `./x.js`; the front's
 * bundler resolves extensionless paths. The only transformation. */
function forFront(text) {
  return text.replace(/(from\s+'[^']+)\.js'/g, "$1'");
}

const files = await walk(source);
if (files.length === 0) {
  console.error('src/contract is empty; nothing to sync.');
  process.exit(1);
}

const check = process.argv.includes('--check');
const errors = [];
let synced = 0;

const expected = new Set();
for (const file of files) {
  const rel = relative(source, file);
  expected.add(rel);
  const wanted = forFront(await readFile(file, 'utf8'));
  const destination = resolve(target, rel);
  const current = await readFile(destination, 'utf8').catch(() => undefined);
  if (current === wanted) continue;
  if (check) {
    errors.push(
      current === undefined
        ? `../front/src/api/contract/${rel} is missing.`
        : `../front/src/api/contract/${rel} differs from src/contract/${rel}.`,
    );
    continue;
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, wanted);
  synced += 1;
}

// A contract file deleted on the backend must not linger on the front.
for (const file of await walk(target)) {
  const rel = relative(target, file);
  if (expected.has(rel)) continue;
  if (check) errors.push(`../front/src/api/contract/${rel} has no source in src/contract/.`);
  else {
    await rm(file);
    synced += 1;
  }
}

/** Every exported contract type, and whether backend code outside
 * `src/contract/` actually references it.
 *
 * A contract the backend never mentions is decorative: the front would be
 * typed against a shape nothing on this side asserts. The count of adopted
 * types is ratcheted so it can rise and never fall, which makes wiring the
 * remaining handlers a one-way street. */
async function adoption() {
  const declared = new Map();
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/^export (?:interface|type) ([A-Za-z0-9_]+)/gm)) {
      declared.set(match[1], relative(source, file));
    }
  }
  const consumers = (await walk(resolve(root, 'src'))).filter(
    (file) => !file.startsWith(source + '/') && file !== source,
  );
  // Only a real import from `src/contract/` counts. A backend type that merely
  // happens to share a name proves nothing: the point is that the handler
  // compiles against the same declaration the front consumes.
  const referenced = new Set();
  for (const file of consumers) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/import\s+type\s*\{([^}]+)\}\s*from\s*'[^']*contract\/[^']+'/g)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
        if (declared.has(name)) referenced.add(name);
      }
    }
  }
  return { declared, referenced };
}

const { declared, referenced } = await adoption();
const adoptedPath = resolve(root, 'src/contract/.adopted');
const floor = Number((await readFile(adoptedPath, 'utf8').catch(() => '0')).trim()) || 0;

if (check) {
  if (referenced.size < floor) {
    errors.push(
      `backend adoption fell from ${floor} to ${referenced.size} contract types. ` +
        'A contract type the backend never references is not enforced by anything.',
    );
  }
} else if (referenced.size > floor) {
  await writeFile(adoptedPath, `${referenced.size}\n`);
}

if (errors.length > 0) {
  console.error(`Contract check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  console.error('Edit src/contract/, then run `npm run sync:contract`.');
  process.exit(1);
}

console.log(
  check
    ? `Contract check passed (${files.length} files in sync; ${referenced.size} of ${declared.size} types referenced by backend code).`
    : `Contract synced (${files.length} files, ${synced} written; ${referenced.size} of ${declared.size} types referenced by backend code).`,
);
