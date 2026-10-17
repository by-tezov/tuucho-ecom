#!/usr/bin/env node
/**
 * Writes the orientation file each module was missing.
 *
 * Entering `src/modules/orders/` showed 46 filenames and nothing else: no
 * statement of what the module owns, where it sits, what it may import, or
 * what a change to it must not break. Everything an agent needed had to be
 * re-derived by reading the code.
 *
 * The mechanical half is generated here, so it cannot drift: the tier, the
 * modules this one may and does import, the routes it serves, its layer sizes
 * and its tests. The half a generator cannot know, the invariants, is
 * hand-written between markers and preserved across regeneration.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const root = resolve('.');
const modulesRoot = resolve(root, 'src/modules');

const check = await readFile(resolve(root, 'scripts/checkArchitecture.mjs'), 'utf8');
const tierBlock = /const moduleTiers = new Map\(\s*Object\.entries\(\{([\s\S]*?)\}\),?\s*\);/.exec(check);
if (!tierBlock) throw new Error('could not read moduleTiers from scripts/checkArchitecture.mjs');
const tiers = new Map(
  [...tierBlock[1].matchAll(/^\s*([a-zA-Z]+):\s*(\d+),/gm)].map((m) => [m[1], Number(m[2])]),
);

const inventory = JSON.parse(await readFile(resolve(root, 'docs/api/routes.json'), 'utf8'));
const allRoutes = [...inventory.publicSurface, ...inventory.opsSurface];

const features = JSON.parse(await readFile(resolve(root, 'docs/features.json'), 'utf8'));
const featureOfModule = new Map();
for (const [name, entry] of Object.entries(features)) {
  if (name.startsWith('$')) continue;
  featureOfModule.set(entry.module.replace('src/modules/', ''), { name, entry });
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(dir, entry.name);
      return entry.isDirectory() ? walk(path) : extname(entry.name) === '.ts' ? [path] : [];
    }),
  );
  return nested.flat();
}

const HAND_START = '<!-- invariants:start -->';
const HAND_END = '<!-- invariants:end -->';
const DEFAULT_INVARIANTS = `${HAND_START}

_Not written yet._ State here what a change to this module must not break:
the rules that hold regardless of how the code is arranged, and what makes
them true. Anything below this marker is preserved when the file is
regenerated.

${HAND_END}`;

const moduleNames = (await readdir(modulesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const check_ = process.argv.includes('--check');
const errors = [];
let written = 0;

for (const name of moduleNames) {
  const dir = resolve(modulesRoot, name);
  const files = await walk(dir);
  const tier = tiers.get(name);

  const layers = new Map();
  for (const file of files) {
    const rel = relative(dir, file);
    const layer = rel.includes('/') ? rel.split('/')[0] : '(root)';
    const lines = (await readFile(file, 'utf8')).split('\n').length;
    const entry = layers.get(layer) ?? { files: 0, lines: 0 };
    entry.files += 1;
    entry.lines += lines;
    layers.set(layer, entry);
  }

  const imported = new Set();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/from '([^']+)'/g)) {
      const target = relative(root, resolve(file, '..', match[1]));
      if (!target.startsWith('src/modules/')) continue;
      const other = target.split('/')[2];
      if (other !== name) imported.add(other);
    }
  }

  const routes = allRoutes.filter((route) => route.source?.startsWith(`src/modules/${name}/`));
  const feature = featureOfModule.get(name);
  const mayImport = [...tiers.entries()]
    .filter(([, value]) => tier !== undefined && value < tier)
    .map(([other]) => other)
    .sort();

  const layerTable = [...layers.entries()]
    .sort()
    .map(([layer, entry]) => `| \`${layer}/\` | ${entry.files} | ${entry.lines} |`)
    .join('\n');

  // A large module groups its application layer by sub-capability. Listing
  // those is what turns "46 filenames" into somewhere to start.
  const groups = new Map();
  for (const file of files) {
    const rel = relative(dir, file);
    const parts = rel.split('/');
    if (parts.length < 3 || parts[0] !== 'application') continue;
    const entry = groups.get(parts[1]) ?? { files: 0, lines: 0 };
    entry.files += 1;
    entry.lines += (await readFile(file, 'utf8')).split('\n').length;
    groups.set(parts[1], entry);
  }
  const groupSection =
    groups.size === 0
      ? ''
      : `## Sub-capabilities

${[...groups.entries()]
  .sort()
  .map(([group, entry]) => `- \`application/${group}/\` — ${entry.files} files, ${entry.lines} lines`)
  .join('\n')}

`;

  const routeList =
    routes.length === 0
      ? '_Serves no HTTP route._'
      : routes
          .slice()
          .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
          .map((route) => `- \`${route.method} ${route.path}\``)
          .join('\n');

  const generated = `# ${name}

<!-- The section above the invariants marker is generated by
     \`npm run sync:module-docs\`. Do not edit it: \`npm run check:module-docs\`
     rejects a hand-edited copy. Write what matters below the marker. -->

**Tier ${tier ?? '(unassigned)'}.** Its \`application\`, \`domain\` and
\`infrastructure\` may import only a strictly lower tier. \`http/\` composes freely
but may never reach into another module's \`http/\` or \`infrastructure/\`.

May import: ${mayImport.length > 0 ? mayImport.map((m) => `\`${m}\``).join(', ') : '_nothing above platform_'}.

Currently imports: ${imported.size > 0 ? [...imported].sort().map((m) => `\`${m}\``).join(', ') : '_no other module_'}.

${feature ? `Feature map entry: \`${feature.name}\` in [docs/features.json](../../../docs/features.json). Run \`npm run feature -- ${feature.name}\` for its full span.` : '_Not a feature-map entry; it is shared by several features._'}

| Layer | Files | Lines |
| --- | --- | --- |
${layerTable}

${groupSection}## Routes

${routeList}

## Invariants

`;

  const path = resolve(dir, 'README.md');
  const existing = await readFile(path, 'utf8').catch(() => undefined);
  const handWritten =
    existing && existing.includes(HAND_START)
      ? existing.slice(existing.indexOf(HAND_START), existing.indexOf(HAND_END) + HAND_END.length)
      : DEFAULT_INVARIANTS;
  const next = `${generated}${handWritten}\n`;

  if (check_) {
    if (existing !== next) {
      errors.push(`src/modules/${name}/README.md is out of date. Run \`npm run sync:module-docs\`.`);
    }
    continue;
  }
  if (existing !== next) {
    await writeFile(path, next);
    written += 1;
  }
}

if (errors.length > 0) {
  console.error(`Module documentation check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(
  check_
    ? `Module documentation check passed (${moduleNames.length} modules).`
    : `Module documentation written (${moduleNames.length} modules, ${written} updated).`,
);
