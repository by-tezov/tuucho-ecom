#!/usr/bin/env node
/**
 * How much a change to one feature has to be able to reach.
 *
 * The cost of a change for an agent is the size of the smallest correct
 * context, so that size is measured and ratcheted like any other budget. A
 * feature that quietly grows past its ceiling is a feature that has become
 * expensive to change, and the check says so before it is discovered by
 * running out of context.
 *
 * Counted per feature: its backend module, the documentation a change must
 * keep in step, the front files that consume it, and the shared front modules
 * those files import directly (see sharedFrontLines).
 *
 * Tests are reported but deliberately not counted: they are what you run, not
 * what you read, and counting them made the budget punish adding a test.
 *
 * A module's own `README.md` is not counted either. Orientation is read
 * *instead of* code, so charging for it would penalise the thing that makes a
 * module cheaper to understand. Only `docs/` counts, because that is contract
 * documentation a change has to keep in step.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const root = resolve('.');
const frontRoot = resolve(root, '../front');
const CODE = new Set(['.ts', '.tsx']);
const PROSE = new Set(['.md']);

/**
 * Shared front trees. A feature's own `src/components/<feature>` directory is
 * listed in features.json and counted wholesale, but the hooks, state and
 * utils it reaches were counted nowhere — which let a feature's real cost grow
 * without moving any budget. `useCart.tsx` alone is over 1,200 lines that
 * every cart, checkout, gift and payments change reads.
 */
const SHARED_FRONT_TREES = ['src/hooks', 'src/state', 'src/utils'];

/**
 * Direct imports only, deliberately.
 *
 * The transitive closure is not the answer: follow it and every feature
 * reaches 20-50k lines, because `AuthContext` imports `useCart` and the graph
 * swallows the app. Nobody reads it that way. What a change actually opens is
 * the shared modules its own files name, so that is what is counted — one hop
 * from the feature's listed files, resolved for real rather than guessed.
 *
 * Counted per feature, so a shared module is charged to each feature that
 * names it. That is the intended incentive: a hook used by six features costs
 * six budgets, and shrinking it pays back six times.
 */
async function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')]) {
    const found = await stat(candidate).then((entry) => entry.isFile()).catch(() => false);
    if (found) return candidate;
  }
  return null;
}

/** Every `.ts`/`.tsx` file under `path` (a file or a directory), tests aside. */
async function sourceFilesUnder(path) {
  let entry;
  try {
    entry = await stat(path);
  } catch {
    return [];
  }
  if (entry.isFile()) return CODE.has(extname(path)) && !isNotContext(path) ? [path] : [];
  const children = await readdir(path);
  const nested = await Promise.all(children.map((child) => sourceFilesUnder(resolve(path, child))));
  return nested.flat();
}

const IMPORT_SPECIFIER = /(?:from\s*|\bimport\s*\()\s*'([^']+)'/g;

async function sharedFrontLines(seedFiles) {
  const seeds = new Set(seedFiles);
  const shared = new Set();
  for (const file of seedFiles) {
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(IMPORT_SPECIFIER)) {
      const target = await resolveLocalImport(file, match[1]);
      if (!target || seeds.has(target) || isNotContext(target)) continue;
      if (SHARED_FRONT_TREES.some((tree) => target.startsWith(`${resolve(frontRoot, tree)}/`))) {
        shared.add(target);
      }
    }
  }
  let total = 0;
  for (const file of shared) total += (await readFile(file, 'utf8')).split('\n').length;
  return total;
}

/** A module's own line count, minus the things a change does not have to read.
 *
 * Co-located `*.test.ts` files sit inside `src/modules/<feature>/`, so walking
 * the module counted them even though the budget is supposed to exclude tests.
 * That is the same wrong incentive this measure was already corrected for once,
 * still in place for the tests that live beside the code: adding one made a
 * feature look more expensive to change. A module README is excluded for the
 * same reason. It is orientation; it does not enlarge the problem. */
function isNotContext(path) {
  return path.endsWith('.test.ts') || path.endsWith('.test.tsx') || path.endsWith('/README.md');
}

async function countLines(path, counted = CODE) {
  let entry;
  try {
    entry = await stat(path);
  } catch {
    return 0;
  }
  if (entry.isDirectory()) {
    const children = await readdir(path);
    const counts = await Promise.all(children.map((child) => countLines(resolve(path, child), counted)));
    return counts.reduce((total, value) => total + value, 0);
  }
  if (!counted.has(extname(path)) || isNotContext(path)) return 0;
  return (await readFile(path, 'utf8')).split('\n').length;
}

const features = JSON.parse(await readFile(resolve(root, 'docs/features.json'), 'utf8'));
const frontAvailable = await stat(frontRoot).then(() => true).catch(() => false);

const rows = [];
for (const [name, entry] of Object.entries(features)) {
  if (name.startsWith('$')) continue;
  const backend = await countLines(resolve(root, entry.module));
  const docs =
    (await countLines(resolve(root, entry.apiDoc), PROSE)) +
    (await countLines(resolve(root, entry.schemaDoc), PROSE));
  const tests = (await Promise.all(entry.tests.map((p) => countLines(resolve(root, p))))).reduce(
    (total, value) => total + value,
    0,
  );
  const frontPaths = frontAvailable
    ? [...entry.frontRoutes, ...entry.frontApi, ...entry.frontComponents]
    : [];
  const front = (await Promise.all(frontPaths.map((p) => countLines(resolve(frontRoot, p))))).reduce(
    (total, value) => total + value,
    0,
  );
  const seedFiles = (
    await Promise.all(frontPaths.map((p) => sourceFilesUnder(resolve(frontRoot, p))))
  ).flat();
  const shared = frontAvailable ? await sharedFrontLines(seedFiles) : 0;
  rows.push({ name, backend, docs, front, shared, tests, total: backend + docs + front + shared });
}
rows.sort((a, b) => b.total - a.total);

/** Headroom a budget may carry above the current measurement. See the slack
 * check near the bottom of this file for why it exists. */
const ALLOWED_SLACK = 2000;

const budgetPath = resolve(root, 'docs/features.context.json');
const budgets = JSON.parse(await readFile(budgetPath, 'utf8').catch(() => '{}'));

if (process.argv.includes('--update')) {
  // Keeps a hand-set ceiling that is still within ALLOWED_SLACK instead of
  // collapsing it onto today's measurement: a budget deliberately raised to
  // leave room must survive the next `sync:context`, or the headroom lasts
  // only until someone regenerates. A budget below the measurement, or slack
  // wider than allowed, is rewritten to the real number as before.
  const next = Object.fromEntries(
    rows.map((row) => {
      const current = budgets[row.name];
      const keepCeiling =
        typeof current === 'number' && current > row.total && current - row.total <= ALLOWED_SLACK;
      return [row.name, keepCeiling ? current : row.total];
    }),
  );
  await (await import('node:fs/promises')).writeFile(
    budgetPath,
    `${JSON.stringify(
      {
        $comment:
          'Lines a change to each feature must read: backend module + docs + front files + the shared front modules (src/hooks, src/state, src/utils) those files import directly. Tests are excluded on purpose, so adding one never costs budget. A budget is a ceiling: `npm run check:context` fails when a feature grows past it, and a feature may sit up to ALLOWED_SLACK lines under it so that writing down why code exists is not paid for by deleting it. A reduction wider than that slack must be locked in with `npm run sync:context`, which also preserves a ceiling deliberately raised for headroom. Lower a budget by splitting a feature, or by shrinking a shared front module — one used by six features is charged to all six.',
        ...next,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`context budgets written for ${rows.length} features.`);
  process.exit(0);
}

const table = rows.map((row) => {
  const budget = budgets[row.name];
  const mark = budget === undefined ? 'new' : row.total > budget ? `over ${budget}` : `${budget}`;
  return `  ${row.name.padEnd(14)} ${String(row.total).padStart(6)}   back ${String(row.backend).padStart(5)}  docs ${String(row.docs).padStart(5)}  front ${String(row.front).padStart(5)}  shared ${String(row.shared).padStart(5)}  tests ${String(row.tests).padStart(5)}   budget ${mark}`;
});

if (!process.argv.includes('--check')) {
  console.log('Lines a change must read (tests shown but not counted):\n');
  console.log(table.join('\n'));
  console.log(`\n  ${'total'.padEnd(14)} ${String(rows.reduce((t, r) => t + r.total, 0)).padStart(6)}`);
  process.exit(0);
}

const errors = rows
  .filter((row) => budgets[row.name] !== undefined && row.total > budgets[row.name])
  .map(
    (row) =>
      `${row.name} now needs ${row.total} lines of context, over its ${budgets[row.name]} budget. ` +
        'Split it or move shared code down a tier; raise the budget with `npm run sync:context` only when the growth is a capability the feature did not have.',
  );
const missing = rows.filter((row) => budgets[row.name] === undefined).map((row) => `${row.name} has no context budget. Run \`npm run sync:context\`.`);
/** The budget is a ceiling, not an equality.
 *
 * It used to be one-way like the file-size ratchets: any slack failed the
 * check, so a budget always equalled the current measurement and every
 * reduction was locked in immediately. That turned out to punish the wrong
 * thing. The measure counts comment lines along with code, so explaining *why*
 * a piece of code exists cost exactly as much budget as the code itself, and
 * the cheapest way to get back under a tight ceiling was always to delete the
 * reasoning a later reader needs most. Documentation that only survives until
 * the next feature needs 20 lines is not documentation.
 *
 * `ALLOWED_SLACK` is therefore real headroom: a feature may sit under its
 * budget by up to this much without failing, and `npm run sync:context` still
 * reports the true measurement so growth stays visible. Beyond it the
 * reduction is treated as permanent and must be locked in, which keeps a large
 * genuine shrink (a split, a feature moved out) from silently becoming
 * permission to regrow. */
const slack = rows
  .filter(
    (row) => budgets[row.name] !== undefined && row.total < budgets[row.name] - ALLOWED_SLACK,
  )
  .map(
    (row) =>
      `${row.name} now needs ${row.total} lines, more than ${ALLOWED_SLACK} under its ${budgets[row.name]} budget. Run \`npm run sync:context\` to lock the reduction in.`,
  );
errors.push(...slack);

if (errors.length + missing.length > 0) {
  console.error(`Context check failed (${errors.length + missing.length}):`);
  for (const error of [...errors, ...missing]) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Context check passed (${rows.length} features within budget).`);
