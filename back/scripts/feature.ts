/**
 * `npm run feature -- <name>` prints everything one capability spans:
 * documentation, the owning module, the routes it actually serves, the front
 * files that consume it, its i18n namespace, its commands and its tests.
 *
 * It exists so a task starts with one command instead of several rounds of
 * search. Route ownership is derived from `docs/api/routes.json` rather than
 * stored in `docs/features.json`, so it cannot drift from the running app.
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const frontRoot = resolve(root, '../pamsurin-front');

type Feature = {
  apiDoc: string;
  schemaDoc: string;
  module: string;
  frontRoutes: string[];
  frontApi: string[];
  frontComponents: string[];
  i18n: string[];
  commands: string[];
  tests: string[];
};

type Route = { method: string; path: string; source?: string; middleware: string[] };

const features = JSON.parse(await readFile(resolve(root, 'docs/features.json'), 'utf8')) as Record<
  string,
  Feature
>;
const inventory = JSON.parse(await readFile(resolve(root, 'docs/api/routes.json'), 'utf8')) as {
  publicSurface: Route[];
  opsSurface: Route[];
};

const names = Object.keys(features).filter((name) => !name.startsWith('$'));
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const requested = args.find((arg) => !arg.startsWith('--'));

if (!requested) {
  if (asJson) console.log(JSON.stringify({ features: names }, null, 2));
  else {
    console.log('Features:');
    for (const name of names) console.log(`  ${name}`);
    console.log("\nRun `npm run feature -- <name>` for one feature's full map.");
  }
  process.exit(0);
}

const feature = features[requested];
if (!feature) {
  console.error(`Unknown feature \`${requested}\`. Known: ${names.join(', ')}.`);
  process.exit(1);
}

function routesFor(surface: Route[]): Route[] {
  return surface.filter((route) => route.source?.startsWith(`${feature.module}/`));
}

const publicRoutes = routesFor(inventory.publicSurface);
const opsRoutes = routesFor(inventory.opsSurface);

/** Layer file counts say at a glance whether a feature keeps real domain
 * rules or is still mostly an HTTP shell over a legacy service. */
async function layerCounts(moduleDir: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  async function walk(directory: string, layer?: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path, layer ?? entry.name);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const key = layer ?? '(root)';
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  await walk(resolve(root, moduleDir));
  return counts;
}

const layers = await layerCounts(feature.module);

if (asJson) {
  console.log(
    JSON.stringify(
      { name: requested, ...feature, layers, routes: { public: publicRoutes, ops: opsRoutes } },
      null,
      2,
    ),
  );
  process.exit(0);
}

function section(title: string, lines: string[]): void {
  console.log(`\n${title}`);
  if (lines.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const line of lines) console.log(`  ${line}`);
}

console.log(`Feature: ${requested}`);

section('Documentation', [feature.apiDoc, feature.schemaDoc, 'docs/architecture/README.md']);

section('Backend module', [
  feature.module,
  ...Object.entries(layers)
    .sort()
    .map(([layer, count]) => `  ${layer}: ${count} file${count === 1 ? '' : 's'}`),
]);

section(
  `Public routes (${publicRoutes.length})`,
  publicRoutes.map(
    (route) =>
      `${route.method.padEnd(6)} ${route.path}${route.middleware.length > 0 ? `   [${route.middleware.join(', ')}]` : ''}`,
  ),
);

section(
  `Ops routes (${opsRoutes.length})`,
  opsRoutes.map((route) => `${route.method.padEnd(6)} ${route.path}`),
);

section(`Front (${frontRoot})`, [
  ...feature.frontRoutes.map((path) => `route      ${path}`),
  ...feature.frontApi.map((path) => `api        ${path}`),
  ...feature.frontComponents.map((path) => `components ${path}`),
  ...feature.i18n.map((namespace) => `i18n       Strings.${namespace}`),
]);

section(
  'Commands',
  feature.commands.map((command) => `npm run ${command} -- --dev`),
);

section('Tests', feature.tests);

console.log('');
