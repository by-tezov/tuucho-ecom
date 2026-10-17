/**
 * Where is the code that does X.
 *
 * `npm run feature` answers which files a feature spans, which is the right
 * answer to a different question. Inside `orders/application`, 46 files and
 * 8,903 lines, finding the function that cancels an order took three to six
 * greps, each returning file excerpts, before the first line of work.
 *
 * This indexes every exported symbol in `src/` (and optionally the front-end)
 * with its signature, location, owning module and layer, and how many files
 * import it, then answers a query in one short list.
 *
 * ```bash
 * npm run where -- cancel            # symbols whose name matches
 * npm run where -- "cancel order"    # all words must match
 * npm run where -- cancel --module orders
 * npm run where -- cancel --front    # search ../front instead
 * npm run where -- cancel --json
 * ```
 *
 * The index is rebuilt whenever a source file is newer than the cache, so it
 * cannot go stale and nothing has to remember to regenerate it. That is why it
 * is not a committed artifact with a `check:` guard, unlike `routes.json` or
 * `tables.json`: those describe a contract others depend on, this is a lookup.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve('.');
const frontRoot = resolve(root, '../front');
const cacheDir = resolve(root, 'output/cache');

type Symbol_ = {
  name: string;
  kind: string;
  signature: string;
  file: string;
  line: number;
  module: string;
  layer: string;
  importedBy: number;
};

type Index = {
  builtAt: string;
  newest: number;
  symbols: Symbol_[];
};

async function walk(directory: string, extensions: string[]): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return entry.name === 'node_modules' ? Promise.resolve([]) : walk(path, extensions);
      }
      return Promise.resolve(extensions.some((extension) => path.endsWith(extension)) ? [path] : []);
    }),
  );
  return nested.flat();
}

/** `src/modules/<module>/<layer>/...` is the shape that carries meaning;
 * everything else reports its top-level directory, which is enough to tell
 * `platform` from `middleware` from a front-end `components/cart`. */
function placeOf(relativePath: string): { module: string; layer: string } {
  const moduleMatch = /^src\/modules\/([^/]+)\/([^/]+)\//.exec(relativePath);
  if (moduleMatch) return { module: moduleMatch[1], layer: moduleMatch[2] };
  const segments = relativePath.split('/');
  // Only report a layer when the third segment is a directory, so
  // `src/hooks/useCart.tsx` reads as `hooks`, not `hooks/useCart.tsx`.
  return { module: segments[1] ?? segments[0], layer: segments.length > 3 ? segments[2] : '' };
}

/** Export extraction is a line scanner, not a TypeScript AST walk.
 *
 * This repository is on `typescript@7`, whose package no longer exposes the
 * old compiler API (`createSourceFile` and friends), and pulling a second
 * TypeScript in for a lookup tool would be a real dependency for a convenience.
 * A lookup ranks candidates, it does not certify a contract the way
 * `check:routes` or `check:sql` do, so an occasional miss on exotic syntax
 * costs a grep, not a wrong answer about what the code guarantees.
 */
const EXPORT_LINE =
  /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(abstract class|class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

/** The declaration text up to the point its body starts, on one line. A
 * signature is what tells you whether this is the symbol you wanted; the body
 * is what you open the file for. */
function signatureFrom(lines: string[], index: number): string {
  let text = '';
  for (let cursor = index; cursor < Math.min(index + 8, lines.length); cursor += 1) {
    text += `${cursor === index ? '' : ' '}${lines[cursor].trim()}`;
    const collapsed = text.replace(/\s+/g, ' ');
    // A body opens with `{`, an arrow body with `=>`, and a type alias or a
    // plain const ends at the first `;` that closes it.
    const stop = /^(.*?)(\s*\{\s*$|\s*=>\s*\{?\s*$|;\s*$)/.exec(collapsed);
    if (stop) return stop[1].trim().slice(0, 240);
    if (cursor === index + 7) return collapsed.trim().slice(0, 240);
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function exportedSymbols(path: string, text: string, base: string): Symbol_[] {
  const where = relative(base, path);
  const place = placeOf(where);
  const lines = text.split('\n');
  const found: Symbol_[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = EXPORT_LINE.exec(lines[index]);
    if (!match) continue;
    const declared = match[1];
    const kind =
      declared === 'function'
        ? 'function'
        : declared === 'abstract class'
          ? 'class'
          : declared === 'const' || declared === 'let' || declared === 'var'
            ? /=\s*(async\s*)?(\(|function\b|[A-Za-z_$][\w$]*\s*=>)/.test(lines[index])
              ? 'function'
              : 'const'
            : declared;
    found.push({
      name: match[2],
      kind,
      signature: signatureFrom(lines, index),
      file: where,
      line: index + 1,
      module: place.module,
      layer: place.layer,
      importedBy: 0,
    });
  }

  return found;
}

async function buildIndex(base: string, extensions: string[]): Promise<Index> {
  const files = await walk(resolve(base, 'src'), extensions);
  const texts = await Promise.all(files.map((path) => readFile(path, 'utf8')));
  const times = await Promise.all(files.map((path) => stat(path).then((info) => info.mtimeMs)));
  const newest = times.reduce((latest, value) => Math.max(latest, value), 0);

  const symbols = files.flatMap((path, position) => exportedSymbols(path, texts[position], base));

  // How many files import a name, as a rough measure of how public it is. An
  // exact resolver would cost a full TypeScript program for a number that only
  // has to rank a result list.
  const importCounts = new Map<string, number>();
  for (const text of texts) {
    for (const match of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}/g)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) importCounts.set(name, (importCounts.get(name) ?? 0) + 1);
      }
    }
  }
  for (const symbol of symbols) symbol.importedBy = importCounts.get(symbol.name) ?? 0;

  return { builtAt: new Date().toISOString(), newest, symbols };
}

async function loadIndex(base: string, extensions: string[], cacheName: string): Promise<Index> {
  const cachePath = resolve(cacheDir, cacheName);
  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8')) as Index;
    const files = await walk(resolve(base, 'src'), extensions);
    const times = await Promise.all(files.map((path) => stat(path).then((info) => info.mtimeMs)));
    const newest = times.reduce((latest, value) => Math.max(latest, value), 0);
    if (newest <= cached.newest && cached.symbols.length > 0) return cached;
  } catch {
    // No cache yet, or an unreadable one. Rebuilding is the recovery.
  }
  const index = await buildIndex(base, extensions);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(index));
  return index;
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const front = args.includes('--front');
const moduleFilter = (() => {
  const position = args.indexOf('--module');
  return position === -1 ? undefined : args[position + 1]?.toLowerCase();
})();
const terms = args
  .filter((argument, position) => !argument.startsWith('--') && args[position - 1] !== '--module')
  .flatMap((argument) => argument.split(/\s+/))
  .filter(Boolean)
  .map((term) => term.toLowerCase());

if (terms.length === 0) {
  console.error('Usage: npm run where -- <query> [--module <name>] [--front] [--json]');
  process.exit(1);
}

const base = front ? frontRoot : root;
const index = await loadIndex(base, front ? ['.ts', '.tsx'] : ['.ts'], front ? 'symbols-front.json' : 'symbols.json');

const matches = index.symbols
  .filter((symbol) => {
    if (moduleFilter && symbol.module.toLowerCase() !== moduleFilter) return false;
    const haystack = `${symbol.name} ${symbol.file}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  })
  .sort((a, b) => {
    // An exact name match first, then a name match over a path match, then
    // however public the symbol is.
    const exact = Number(b.name.toLowerCase() === terms.join('')) - Number(a.name.toLowerCase() === terms.join(''));
    if (exact !== 0) return exact;
    const byName =
      Number(terms.every((term) => b.name.toLowerCase().includes(term))) -
      Number(terms.every((term) => a.name.toLowerCase().includes(term)));
    if (byName !== 0) return byName;
    return b.importedBy - a.importedBy;
  });

if (json) {
  console.log(JSON.stringify({ query: terms, matches: matches.slice(0, 40) }, null, 2));
  process.exit(0);
}

if (matches.length === 0) {
  console.log(`Nothing exported matches ${terms.map((term) => `\`${term}\``).join(' + ')} in ${front ? 'kernel/front' : 'kernel/back'}.`);
  process.exit(0);
}

const shown = matches.slice(0, 15);
console.log(`${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length > shown.length ? `, showing ${shown.length}` : ''}:\n`);
for (const symbol of shown) {
  const place = symbol.layer ? `${symbol.module}/${symbol.layer}` : symbol.module;
  console.log(`  ${symbol.signature}`);
  console.log(
    `    ${symbol.file}:${symbol.line}   ${place}   imported by ${symbol.importedBy} file${symbol.importedBy === 1 ? '' : 's'}\n`,
  );
}
