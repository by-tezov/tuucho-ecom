#!/usr/bin/env node
/**
 * Front-end file-size ratchets.
 *
 * Two trees, same mechanism. `src/routes` holds page orchestrators, which are
 * allowed to be large (ceiling 2200); `src/components`, `src/hooks` and
 * `src/state` hold the parts a page is built from, where the useful ceiling is
 * far lower (600).
 *
 * The ceiling applies to new files. Today's larger ones each carry an
 * individual non-growth ratchet instead, because a blanket cap would demand
 * refactoring exactly the code that has the least test coverage. They come
 * down when someone is in there anyway — and `--fix` makes each reduction
 * permanent.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';

const routesRoot = resolve('src/routes');
const routeStageCeiling = 2200;
/** Individual non-growth ratchets for routes that still exceed a practical split target. */
const legacyRouteRatchetedLines = new Map([
  // CartPage.tsx is a thin shell; ShopCartPage is the shop-cart orchestrator.
  ['cart/ShopCartPage.tsx', 580],
  ['AdminOrdersPage.tsx', 715],
  ['AdminPreferencesPage.tsx', 884],
  ['AdminUsersPage.tsx', 560],
]);

const partsRoot = resolve('src');
const partsCeiling = 600;
/** Individual non-growth ratchets for the parts that are already over it. */
const legacyPartRatchetedLines = new Map([
  ['components/checkout/CheckoutPaymentSection.tsx', 1199],
  // The provider split out of hooks/useCart.tsx (1173 lines) carries its ratchet.
  ['hooks/CartProvider.tsx', 916],
  ['components/checkout/GuestCheckoutPrompt.tsx', 976],
  ['components/address/AddressFormModal.tsx', 856],
  ['components/auth/LoginForm.tsx', 856],
  ['state/AuthContext.tsx', 873],
  ['components/orders/OrdersList.tsx', 686],
  ['components/layout/CartControl.tsx', 370],
  ['components/gallery/PhotoLightboxView.tsx', 693],
  ['components/chat/AccountContactChat.tsx', 695],
  ['components/onboarding/LoyaltyScene.tsx', 685],
  ['components/orders/EditOrderBillingModal.tsx', 536],
  ['components/gallery/useLightboxSheet.ts', 524],
  ['components/cart/CartSwitcher.tsx', 467],
]);

/** Only these three trees, so `src/routes` keeps its own higher ceiling and
 * generated or config-shaped directories (assets, data, config) stay out. */
const PART_TREES = ['components', 'hooks', 'state'];

async function walkAny(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walkAny(path);
      return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
    }),
  );
  return nested.flat();
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : extname(entry.name) === '.tsx' ? [path] : [];
    }),
  );
  return nested.flat();
}

const paths = await walk(routesRoot);
const partPaths = (await Promise.all(PART_TREES.map((tree) => walkAny(resolve(partsRoot, tree)))))
  .flat()
  .filter((path) => !/\.test\.tsx?$/.test(path));
const errors = [];

/** `--fix` lowers every ratchet to what the file now measures.
 *
 * A ratchet set at today's line count prevents growth and nothing else, so a
 * 1,350-line page stays a permanent 1,350-line read. Failing on slack as well
 * as on growth makes each one a one-way valve: the moment a file gets smaller,
 * the smaller size becomes the ceiling. */
const fixRatchets = process.argv.includes('--fix');
const ratchetSlack = [];

/** One pass over a tree: over the ceiling is an error, under a ratchet is
 * slack that `--fix` locks in. Identical rule for routes and for parts. */
async function measureTree({ root, prefix, ceiling, ratchets, noun }) {
  for (const path of await root) {
    const source = await readFile(path, 'utf8');
    const name = relative(prefix, path).replaceAll('\\', '/');
    const lines = source.split('\n').length;
    const limit = ratchets.get(name) ?? ceiling;
    if (ratchets.has(name) && lines < limit) ratchetSlack.push({ name, limit, lines });
    if (lines > limit) {
      errors.push(
        `${relative(resolve('.'), path).replaceAll('\\', '/')} is ${lines} lines; ` +
          (ratchets.has(name)
            ? `its individual ratchet is ${limit}. Split before growing further.`
            : `split ${noun} before they exceed ${ceiling}.`),
      );
    }
  }
}

await measureTree({
  root: Promise.resolve(paths),
  prefix: routesRoot,
  ceiling: routeStageCeiling,
  ratchets: legacyRouteRatchetedLines,
  noun: 'route files',
});
await measureTree({
  root: Promise.resolve(partPaths),
  prefix: partsRoot,
  ceiling: partsCeiling,
  ratchets: legacyPartRatchetedLines,
  noun: 'components, hooks and state files',
});

/** Rewrites the numbers in this file's own source. The map holds plain
 * `['path', number]` entries, so the edit is one line each and the comments
 * around them survive. */
async function lowerRatchets(entries) {
  const selfPath = new URL(import.meta.url).pathname;
  let text = await readFile(selfPath, 'utf8');
  for (const entry of entries) {
    const pattern = new RegExp(`(\\['${entry.name.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}',\\s*)\\d+(\\])`);
    text = text.replace(pattern, `$1${entry.lines}$2`);
  }
  await writeFile(selfPath, text);
}

if (ratchetSlack.length > 0) {
  if (fixRatchets) {
    await lowerRatchets(ratchetSlack);
    console.log(`Lowered ${ratchetSlack.length} ratchet${ratchetSlack.length === 1 ? '' : 's'}:`);
    for (const entry of ratchetSlack) console.log(`- ${entry.name}: ${entry.limit} -> ${entry.lines}`);
  } else {
    for (const entry of ratchetSlack) {
      errors.push(
        `${entry.name} is ${entry.lines} lines but its ratchet is still ${entry.limit}. ` +
          'Run `npm run sync:ratchets` to lock the reduction in.',
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`Architecture check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Architecture check passed for ${paths.length} route files and ${partPaths.length} component/hook/state files.`,
  );
}

/**
 * Layer direction.
 *
 * `routes` compose pages, `ui` renders, `api` talks to the backend, `platform`
 * is subject-free support. Imports run downward only.
 *
 * `state/`, `theme/` and the `.tsx` hooks sit in `ui` rather than below it,
 * because those modules render: `AuthContext` mounts a merge dialog and
 * `ThemeProvider` calls the account API. Pretending they are a lower layer is
 * what produced the back-edges this rule exists to prevent.
 *
 * Only value imports count. `import type` creates no runtime edge, so a client
 * may name a type declared anywhere without inverting anything.
 */
const layerOf = (name) => {
  const top = name.split('/')[0];
  if (top === 'routes') return 3;
  if (['components', 'hooks', 'state', 'theme'].includes(top)) return 2;
  if (top === 'api') return 1;
  if (['config', 'utils', 'data', 'assets', 'observability', 'styles', 'test'].includes(top)) return 0;
  return undefined; // entry points and App.tsx compose everything
};

const layerNames = ['platform', 'api', 'ui', 'routes'];
const allSources = await walkAny(resolve('src'));
const layerErrors = [];

for (const path of allSources) {
  const name = relative(resolve('src'), path).replaceAll('\\', '/');
  const from = layerOf(name);
  if (from === undefined) continue;
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/(^|\n)\s*import\s+(type\s+)?([^;]*?)from\s+'([^']+)'/g)) {
    const [, , typeOnly, clause, specifier] = match;
    if (typeOnly) continue;
    // `import { type X }` with no value bindings is also type-only.
    const bindings = clause
      .replace(/[{}]/g, '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (bindings.length > 0 && bindings.every((part) => part.startsWith('type '))) continue;
    if (!specifier.startsWith('.')) continue;
    const target = relative(resolve('src'), resolve(dirname(path), specifier)).replaceAll('\\', '/');
    const to = layerOf(target);
    if (to === undefined || to <= from) continue;
    layerErrors.push(
      `${name} (${layerNames[from]}) imports ${target} (${layerNames[to]}); imports run downward only.`,
    );
  }
}

if (layerErrors.length > 0) {
  console.error(`Layer check failed (${layerErrors.length}):`);
  for (const error of [...new Set(layerErrors)].sort()) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Layer check passed for ${allSources.length} files.`);
}

const colocatedUnitTests = allSources.filter((path) => /\.test\.(ts|tsx)$/.test(path));
if (colocatedUnitTests.length > 0) {
  console.error(`Unit-test location check failed (${colocatedUnitTests.length}):`);
  for (const path of colocatedUnitTests.sort()) {
    console.error(`- ${relative(resolve('src'), path)} lives under src/; move it to src-test/unit-test/.`);
  }
  process.exitCode = 1;
} else {
  console.log('Unit-test location check passed (no *.test.ts under src/).');
}
