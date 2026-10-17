import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';

const sourceRoot = resolve('src');

/** `--fix` lowers every size ratchet to what the file now measures.
 *
 * A ratchet set at today's line count prevents growth and nothing else, so a
 * 1,396-line file stays a permanent 1,396-line read. Failing on *slack*, not
 * only on growth, turns each of these into a one-way valve: the moment a file
 * gets smaller, the new size becomes the ceiling. */
const fixRatchets = process.argv.includes('--fix');
const ratchetSlack = [];
/** Individual non-growth ratchets for routers still above the stage ceiling.
 *
 * The two auth routers gained a handful of lines when identity was extracted:
 * their imports now name a sibling module rather than their own, and prettier
 * wraps the longer specifiers. The diff is imports only, no behaviour. */
const legacyRouterRatchetedLines = new Map([
  ['modules/checkout/http/accountCheckout.router.ts', 497],
  ['modules/checkout/http/guestCheckout.router.ts', 428],
  ['modules/cart/http/accountActiveCart.router.ts', 390],
  ['modules/auth/http/authSocialLink.router.ts', 429],
  ['modules/payments/http/accountPaymentMethods.router.ts', 310],
  ['modules/auth/http/authCredentials.router.ts', 361],
]);
const routerStageCeiling = 350;
const moduleUnitCeiling = 500;
/** Non-growth exceptions for units moved out of the old `src/services/` whole.
 * Each is a split that has not happened yet, not a permission to grow.
 * backup/restore is the one path whose correctness cannot be proven by
 * typecheck alone, so it was relocated intact rather than cut at guessed seams.
 *
 * These numbers were recalibrated once, when the repository was formatted with
 * its own prettier: the previous ceilings had been set against text that had
 * never been formatted. They are non-growth from here. */
const oversizedModuleUnits = new Map([
  ['modules/operations/infrastructure/databaseBackup.ts', 768],
  ['modules/identity/application/users.ts', 909],
  ['modules/chat/application/chat.ts', 1015],
  ['modules/orders/application/tracking/shippingTracking.ts', 573],
  ['modules/cart/application/cart.ts', 974],
  ['modules/commerce/application/cartRules.ts', 111],
  ['modules/catalog/application/products.ts', 197],
  ['modules/customers/addresses/application/addresses.ts', 518],
  ['modules/delivery/application/couriers.ts', 619],
  ['modules/loyalty/application/loyalty.ts', 967],
  ['modules/operations/application/libraryImport.ts', 309],
  ['modules/messaging/application/email.ts', 944],
  ['modules/messaging/application/emailStrings.ts', 531],
  ['modules/vouchers/application/vouchers.ts', 527],
  ['modules/invoicing/infrastructure/invoicePdf.ts', 422],
]);
/** Co-located unit tests. Generous, but a test file this long is usually
 * covering several units and should follow them apart. */
const testFileCeiling = 400;

/**
 * Module tiers. A module's business layers (`application`, `domain`,
 * `infrastructure`) may import only from a strictly lower tier, or from itself.
 *
 * `http/` is deliberately exempt: a router composes a response out of whatever
 * the request needs, which is the same job `src/api/` does, and forcing that
 * composition downward would only push it into a fake shared module. Routers
 * still may not reach into another module's `http/` or `infrastructure/`,
 * which is enforced separately below.
 *
 * The tiers are not decoration. Before this rule the module graph had 21
 * mutually dependent pairs and nothing could be read alone; the business
 * layers are now a DAG and this is what keeps them one.
 */
const moduleTiers = new Map(
  Object.entries({
    // 0 — shop configuration and cross-cutting append-only journal.
    // Everything may write the journal; it reads nothing from other modules.
    // Plugin enablement is shop configuration: commerce/vouchers may read it.
    settings: 0,
    activity: 0,
    plugins: 0,
    // 1 — shared kernel. Subject-free mechanisms and commerce vocabulary.
    identity: 1,
    messaging: 1,
    commerce: 1,
    vouchers: 1,
    catalog: 1,
    // Home-page reviews read from the shop's public Vinted profile.
    vintedReviews: 1,
    // 2 — capabilities, ordered by what they are built on.
    payments: 2,
    customers: 3,
    delivery: 4,
    // Creating a carrier label and rendering an invoice are capabilities the
    // order flow uses. Reconciling carrier events back into order status is
    // order fulfilment, so it stays in `orders`.
    shipping: 5,
    invoicing: 5,
    account: 5,
    auth: 6,
    chat: 6,
    contact: 6,
    loyalty: 6,
    // 7 — flows: they orchestrate the capabilities above.
    cart: 7,
    orders: 8,
    checkout: 9,

    gift: 10,
    settlement: 11,
    // 12 — consumers. Nothing may depend on these.
    admin: 12,
    operations: 12,
  }),
);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : extname(entry.name) === '.ts' ? [path] : [];
    }),
  );
  return nested.flat();
}

function sourcePath(path) {
  return relative(sourceRoot, path).replaceAll('\\', '/');
}

function resolveImport(importer, specifier, files) {
  if (!specifier.startsWith('.')) return undefined;
  const candidate = resolve(dirname(importer), specifier.replace(/\.js$/, '.ts'));
  return files.has(candidate) ? candidate : undefined;
}

function stronglyConnectedComponents(graph) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const indexes = new Map();
  const lowLinks = new Map();
  const components = [];

  function visit(node) {
    indexes.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const dependency of graph.get(node) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
      } else if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(dependency)));
      }
    }

    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    components.push(component);
  }

  for (const node of graph.keys()) if (!indexes.has(node)) visit(node);
  return components;
}

const paths = await walk(sourceRoot);
const fileSet = new Set(paths);
const sources = new Map(await Promise.all(paths.map(async (path) => [path, await readFile(path, 'utf8')])));
const graph = new Map();
const errors = [];

for (const [path, source] of sources) {
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  // Specifiers reached only through `import type`. A type edge disappears at
  // compile time, so it constrains nothing at runtime and does not invert a
  // tier: a lower module may name a shape declared above it.
  const typeOnlySpecifiers = new Set(
    [...source.matchAll(/(^|\n)\s*import\s+(type\s+)?([^;]*?)from\s+['"]([^'"]+)['"]/g)]
      .filter(([, , typeKeyword, clause]) => {
        if (typeKeyword) return true;
        const bindings = clause
          .replace(/[{}]/g, '')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
        return bindings.length > 0 && bindings.every((part) => part.startsWith('type '));
      })
      .map((match) => match[4]),
  );
  const typeOnlyTargets = new Set(
    [...typeOnlySpecifiers].map((specifier) => resolveImport(path, specifier, fileSet)).filter(Boolean),
  );
  graph.set(path, imports.map((specifier) => resolveImport(path, specifier, fileSet)).filter(Boolean));

  const name = sourcePath(path);
  const lines = source.split('\n').length;

  // Unit tests live under `src-test/unit-test/`, never beside production modules.
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) {
    errors.push(
      `${name} is a unit test under src/; move it to src-test/unit-test/ (mirroring the src path).`,
    );
    continue;
  }
  if (name.startsWith('api/') && lines > 100)
    errors.push(
      `${name} is ${lines} lines; API composition roots and compatibility facades must stay below 100.`,
    );
  if (name.startsWith('api/') && /\.(?:get|post|put|patch|delete)\s*\(/.test(source))
    errors.push(`${name} registers endpoint handlers; route implementations belong under src/modules/.`);
  if (name.startsWith('modules/') && name.endsWith('.router.ts')) {
    const routerLimit = legacyRouterRatchetedLines.get(name) ?? routerStageCeiling;
    if (legacyRouterRatchetedLines.has(name) && lines < routerLimit) {
      ratchetSlack.push({ name, limit: routerLimit, lines });
    }
    if (lines > routerLimit) {
      errors.push(
        `${name} is ${lines} lines; ` +
          (legacyRouterRatchetedLines.has(name)
            ? `its individual router ratchet is ${routerLimit}. Split before growing further.`
            : `split leaf routers before they exceed ${routerStageCeiling}.`),
      );
    }
    if (/success:\s*false[\s\S]{0,120}?error:\s*['"`]/.test(source)) {
      errors.push(
        `${name} returns a string \`error\`; use { error: { code: '…' } } (see docs/api/00-conventions.md).`,
      );
    }
  }
  const moduleUnitLimit = oversizedModuleUnits.get(name);
  if (moduleUnitLimit !== undefined && lines < moduleUnitLimit) {
    ratchetSlack.push({ name, limit: moduleUnitLimit, lines });
  }
  if (
    name.startsWith('modules/') &&
    !name.endsWith('.router.ts') &&
    lines > (moduleUnitLimit ?? moduleUnitCeiling)
  )
    errors.push(
      `${name} is ${lines} lines; ` +
        (moduleUnitLimit !== undefined
          ? `its individual ratchet is ${moduleUnitLimit}. Split it rather than raising this.`
          : `split module units before they exceed ${moduleUnitCeiling}.`),
    );
  if (name.startsWith('middleware/') && lines > 150)
    errors.push(`${name} is ${lines} lines; split HTTP policy from supporting mechanisms before 150.`);
  if (name.startsWith('media/') && lines > 150)
    errors.push(
      `${name} is ${lines} lines; split media policy, processing, naming, and persistence before 150.`,
    );
  if (name.startsWith('platform/') && lines > 300)
    errors.push(`${name} is ${lines} lines; platform primitives must stay focused below 300.`);

  if (name.startsWith('modules/')) {
    const moduleName = name.split('/')[1];
    for (const dependency of graph.get(path)) {
      const dependencyName = sourcePath(dependency);
      if (
        dependencyName.startsWith('api/') ||
        dependencyName === 'app.ts' ||
        dependencyName === 'opsRoutes.ts'
      ) {
        errors.push(`${name} must not depend on composition module ${dependencyName}.`);
      }
      if (dependencyName.startsWith('modules/')) {
        const dependencyModule = dependencyName.split('/')[1];
        if (
          dependencyModule !== moduleName &&
          (dependencyName.includes('/http/') || dependencyName.includes('/infrastructure/'))
        ) {
          errors.push(`${name} must use a public contract instead of ${dependencyName}.`);
        }
        if (dependencyModule !== moduleName && !name.includes('/http/') && !typeOnlyTargets.has(dependency)) {
          const from = moduleTiers.get(moduleName);
          const to = moduleTiers.get(dependencyModule);
          if (from === undefined)
            errors.push(`module \`${moduleName}\` has no tier in scripts/checkArchitecture.mjs.`);
          else if (to === undefined)
            errors.push(`module \`${dependencyModule}\` has no tier in scripts/checkArchitecture.mjs.`);
          else if (to >= from) {
            errors.push(
              `${name} (tier ${from}) imports ${dependencyName} (tier ${to}); business layers may only import a strictly lower tier.`,
            );
          }
        }
      }
    }
  }

  if (name.includes('/domain/')) {
    for (const specifier of imports) {
      if (
        specifier === 'express' ||
        specifier === 'pg' ||
        specifier === 'stripe' ||
        specifier.startsWith('node:') ||
        /\/(?:config|db|http|infrastructure|services)\//.test(specifier)
      ) {
        errors.push(`${name} domain code must not import ${specifier}.`);
      }
    }
  }

  if (name === 'app.ts' && (/opsGatewayRouter/.test(source) || /['"`]\/ops-gateway['"`]/.test(source))) {
    errors.push(
      'app.ts must not mount the operations gateway; /operation/* is loopback-only (opsServer) or reached through the PHP gateway at OPS_GATEWAY_URL.',
    );
  }

  if (name.startsWith('api/')) {
    for (const match of source.matchAll(/import\s+([^;]+?)\s+from\s+['"]([^'"]+\.routes\.js)['"]/g)) {
      const imported = match[1]
        .replace(/[{}]/g, '')
        .split(',')
        .map(
          (part) =>
            part
              .trim()
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0],
        )
        .filter(Boolean);
      if (imported.some((symbol) => !symbol.endsWith('Router'))) {
        errors.push(`${name} imports non-router helpers from ${match[2]}.`);
      }
    }
  }
}

/** Rewrites the ratchet numbers in this file's own source. The maps are plain
 * `['path', number]` entries, so the edit is one line per entry and the
 * surrounding comments survive. */
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
    console.log(`Lowered ${ratchetSlack.length} size ratchet${ratchetSlack.length === 1 ? '' : 's'}:`);
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

for (const component of stronglyConnectedComponents(graph)) {
  if (component.length > 1) {
    errors.push(`Import cycle: ${component.map(sourcePath).sort().join(' -> ')}`);
  }
}

const unitTestRoot = resolve('src-test/unit-test');
const unitTestPaths = await walk(unitTestRoot).catch(() => []);
for (const path of unitTestPaths) {
  if (!path.endsWith('.test.ts') && !path.endsWith('.test.tsx')) continue;
  const lines = (await readFile(path, 'utf8')).split('\n').length;
  if (lines > testFileCeiling) {
    errors.push(
      `${relative(resolve('.'), path)} is ${lines} lines; split a test file before it exceeds ${testFileCeiling}.`,
    );
  }
}

if (errors.length > 0) {
  console.error(`Architecture check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed for ${paths.length} TypeScript source files.`);
}
