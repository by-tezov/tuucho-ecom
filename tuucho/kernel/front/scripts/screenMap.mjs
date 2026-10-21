#!/usr/bin/env node
/**
 * The one generated answer to "which file do I open to change this screen".
 *
 * Entering this repository showed 798 files and no map. The backend has a
 * README per module, generated and checked, plus `npm run feature`; the front
 * had 297 lines of documentation in total, which is why a front-end task
 * started with several rounds of grep even though the front is now the larger
 * half of most features (payments is 5,255 front lines against 1,132 back).
 *
 * `--write` regenerates `docs/screens.md`: every URL the router serves, the
 * page component behind it, the components directories that page draws from,
 * the API modules it calls and the i18n namespaces it reads.
 *
 * `--check` (used by `npm run check:screens`) fails when that file is stale, so
 * it cannot drift the way hand-written documentation does.
 *
 * The router is read as text rather than evaluated: `App.tsx` builds its tree
 * out of three plain arrays and one nested admin block, all of which say what
 * they mean without a React runtime.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import * as prettier from 'prettier';

const root = resolve('.');
const appPath = resolve(root, 'src/App.tsx');
const routesRoot = resolve(root, 'src/routes');
const componentsRoot = resolve(root, 'src/components');
const outputPath = resolve(root, 'docs/screens.md');

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
    }),
  );
  return nested.flat();
}

const appText = await readFile(appPath, 'utf8');
const sourceFiles = (await walk(resolve(root, 'src'))).map((path) => relative(root, path));

/** Where each page component comes from: the static imports plus the
 * `lazy(() => import('...'))` form used for the heavy screens. The specifier
 * has no extension, so it is resolved against the real file list. */
const importedFrom = new Map();
for (const match of appText.matchAll(/import\s+(?:\{\s*)?(\w+)(?:\s*\})?\s+from\s+'([^']+)'/g)) {
  importedFrom.set(match[1], match[2]);
}
for (const match of appText.matchAll(
  /(?:const|let)\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\('([^']+)'\)/g,
)) {
  importedFrom.set(match[1], match[2]);
}

function fileFor(component) {
  const specifier = importedFrom.get(component);
  if (specifier?.startsWith('.')) {
    const base = relative(root, resolve(root, 'src', specifier.replace(/^\.\//, '')));
    const candidate = sourceFiles.find(
      (path) =>
        path === base || path === `${base}.tsx` || path === `${base}.ts` || path === `${base}/index.tsx`,
    );
    if (candidate) return candidate;
  }
  return sourceFiles.find((path) => path.replace(/\.tsx?$/, '').endsWith(`/${component}`));
}

/** Guards wrap the page, so the component that matters is the innermost one
 * that resolves to a file under `src/routes/`. */
function pageComponentOf(element) {
  const candidates = [...element.matchAll(/<(\w+)/g)].map((match) => match[1]);
  for (const candidate of [...candidates].reverse()) {
    const file = fileFor(candidate);
    if (file?.startsWith('src/routes/')) return candidate;
  }
  return candidates[0];
}

/** `{ path: 'x', element: <Page /> }` entries inside one named array.
 *
 * Splitting on `path:` bounds each entry by the next one, which is what makes
 * a multi-line element (a guard wrapping the page) safe to read without a JSX
 * parser: the region can never run into the following entry. */
function entriesIn(arrayName) {
  const start = appText.indexOf(`const ${arrayName}`);
  if (start === -1) return [];
  const end = appText.indexOf('\n];', start);
  const block = appText.slice(start, end === -1 ? undefined : end);

  const found = [];
  for (const part of block.split(/path:\s*/).slice(1)) {
    const quoted = /^'([^']*)'/.exec(part);
    if (!quoted) continue;
    const rest = part.slice(quoted[0].length);
    if (!rest.includes('element:')) continue;
    found.push({ path: quoted[1], component: pageComponentOf(rest) });
  }
  return found;
}

/** The per-video watch pages are spread in from `config/poseVideos.ts`, so
 * their paths are not literals in `App.tsx`. They are real URLs and Google
 * indexes them, so the map would be wrong without them. */
async function poseVideoEntries() {
  let text;
  try {
    text = await readFile(resolve(root, 'src/config/poseVideos.ts'), 'utf8');
  } catch {
    return [];
  }
  return [...text.matchAll(/path:\s*'([^']*)'/g)].map((match) => ({
    path: match[1].replace(/^\//, ''),
    component: 'PoseVideoPage',
  }));
}

/** The admin area is a nested `<Route path={adminPath()}>` whose children are
 * literal one-line routes. Its base is deployment configuration, so the map
 * names it rather than guessing a value. */
function adminEntries() {
  const start = appText.indexOf('path={adminPath()}');
  if (start === -1) return [];
  const stop = appText.indexOf('\n          </Route>', start);
  const block = appText.slice(start, stop === -1 ? undefined : stop);

  const found = [];
  const index = /<Route index element=\{([\s\S]*?)\}\s*\/>/.exec(block);
  if (index) found.push({ path: '', component: pageComponentOf(index[1]) });
  for (const match of block.matchAll(/<Route\s+path="([^"]*)"\s+element=\{([\s\S]*?)\}\s*\/>/g)) {
    found.push({ path: match[1], component: pageComponentOf(match[2]) });
  }
  return found;
}

/** The handful of routes written directly in the tree rather than in one of
 * the arrays: the splash entry, the not-found catch-all, and the provider
 * return URLs, which are fixed absolute paths a provider console points at. */
function rootEntries() {
  const treeStart = appText.indexOf('export default function App()');
  const adminStart = appText.indexOf('path={adminPath()}');
  const block = appText.slice(treeStart, adminStart === -1 ? undefined : adminStart);
  const found = [];
  for (const match of block.matchAll(/<Route\s+path="(\/[^"]*)"\s+element=\{([\s\S]*?)\}\s*\/>/g)) {
    found.push({ path: match[1].replace(/^\//, ''), component: pageComponentOf(match[2]) });
  }
  // The catch-all is written after the admin block, so it is looked up in the
  // whole tree rather than in the slice above.
  const tree = appText.slice(treeStart);
  for (const match of tree.matchAll(/<Route\s+path="(\*)"\s+element=\{([\s\S]*?)\}\s*\/>/g)) {
    found.push({ path: match[1], component: pageComponentOf(match[2]) });
  }
  return found;
}

const componentDirectories = (await readdir(componentsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** What one page file actually reaches for. These three are the lookups a
 * front-end task starts with, and each was previously a grep. */
const inspected = new Map();
async function inspectPage(file) {
  if (inspected.has(file)) return inspected.get(file);
  let text;
  try {
    text = await readFile(resolve(root, file), 'utf8');
  } catch {
    const empty = { components: [], namespaces: [], apis: [] };
    inspected.set(file, empty);
    return empty;
  }
  const components = new Set();
  for (const match of text.matchAll(/from\s+'[^']*components\/([a-zA-Z]+)\//g)) {
    if (componentDirectories.includes(match[1])) components.add(match[1]);
  }
  const apis = new Set();
  for (const match of text.matchAll(/from\s+'[^']*\/api\/([a-zA-Z]+)'/g)) apis.add(match[1]);
  const namespaces = new Set();
  for (const match of text.matchAll(/\bt\.([a-z][a-zA-Z]*)\b/g)) namespaces.add(match[1]);
  const detail = {
    components: [...components].sort(),
    apis: [...apis].sort(),
    namespaces: [...namespaces].sort(),
  };
  inspected.set(file, detail);
  return detail;
}

const families = [
  {
    name: 'Public',
    prefix: '/{lang}/',
    entries: [...entriesIn('PUBLIC_ROUTE_DEFS'), ...(await poseVideoEntries())],
  },
  { name: 'Customer', prefix: '/{lang}/', entries: entriesIn('CUSTOMER_ROUTE_DEFS') },
  { name: 'Admin', prefix: '/{adminPath}/', entries: adminEntries() },
  { name: 'Root', prefix: '/', entries: rootEntries() },
];

const routeFiles = (await walk(routesRoot)).map((path) => relative(root, path));
const claimed = new Set();

const sections = [];
for (const family of families) {
  const rows = [];
  for (const entry of family.entries) {
    if (!entry.component) continue;
    // `<Navigate>` keeps an old bookmark working; it has no page of its own.
    const file = entry.component === 'Navigate' ? undefined : fileFor(entry.component);
    if (file) claimed.add(file);
    const detail = file ? await inspectPage(file) : { components: [], namespaces: [], apis: [] };
    rows.push({ url: `${family.prefix}${entry.path}`.replace(/\/$/, '') || family.prefix, file, ...detail });
  }
  rows.sort((a, b) => a.url.localeCompare(b.url));
  sections.push({ name: family.name, rows });
}

const unrouted = routeFiles.filter((path) => !claimed.has(path)).sort();

const lines = [
  '# Screens',
  '',
  '<!-- Generated by `npm run sync:screens`. Do not edit: `npm run check:screens`',
  '     rejects a hand-edited copy. -->',
  '',
  'Every URL the router serves and what a change to it has to reach. Start here',
  'for a front-end task, the way `npm run feature` starts a backend one.',
  '',
  '`{lang}` is any of the enabled locales; the public and customer families are',
  'also mounted unprefixed for older bookmarks. `{adminPath}` is the operator',
  'path from `src/config/paths.ts`, which is deployment configuration.',
  '',
];

for (const section of sections) {
  lines.push(
    `## ${section.name} (${section.rows.length})`,
    '',
    '| URL | Page file | Components | API modules | i18n |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const row of section.rows) {
    const file = row.file ? `[${row.file}](../${row.file})` : '(redirect)';
    lines.push(
      `| \`${row.url}\` | ${file} | ${row.components.join(', ') || '-'} | ${row.apis.join(', ') || '-'} | ${row.namespaces.slice(0, 4).join(', ') || '-'} |`,
    );
  }
  lines.push('');
}

lines.push(
  `## Files under \`src/routes/\` with no URL of their own (${unrouted.length})`,
  '',
  'Layouts, shells, and pages composed inside another route.',
  '',
  ...unrouted.map((path) => `- \`${path}\``),
  '',
);

// Written the way prettier formats it (aligned tables), so the generated file
// also passes `npm run format:check`.
const rendered = await prettier.format(lines.join('\n'), {
  ...(await prettier.resolveConfig(outputPath)),
  parser: 'markdown',
});

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = await readFile(outputPath, 'utf8');
  } catch {
    console.error('screens check failed: docs/screens.md is missing. Run `npm run sync:screens`.');
    process.exit(1);
  }
  if (current !== rendered) {
    console.error('screens check failed: docs/screens.md is stale. Run `npm run sync:screens`.');
    process.exit(1);
  }
  console.log(
    `screens check passed (${sections.reduce((total, section) => total + section.rows.length, 0)} routes).`,
  );
} else {
  await writeFile(outputPath, rendered);
  console.log(
    `Wrote docs/screens.md (${sections.reduce((total, section) => total + section.rows.length, 0)} routes, ${unrouted.length} unrouted files).`,
  );
}
