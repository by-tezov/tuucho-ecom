/**
 * What one database table holds, in about twenty lines.
 *
 * The alternative is reading a 100 KB `tuucho/docs/schema/` section or grepping a
 * 120 KB migration, which is the most expensive lookup in this repository for
 * something that changes rarely and is fully derivable.
 *
 * Reads `tuucho/docs/schema/tables.json` (see `npm run sync:schema`) and cross
 * references it against the source tree, so it also answers the question the
 * snapshot cannot: which module owns this table, and which files query it.
 *
 * ```bash
 * npm run table                 # every table, with its owning module
 * npm run table -- carts        # one table in full
 * npm run table -- carts --json
 * ```
 */
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { SchemaSnapshot, TableSnapshot } from './schemaSnapshot.js';

const root = resolve('.');
const snapshotPath = resolve(root, '../../docs/schema/tables.json');
const sourceRoot = resolve(root, 'src');

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return path.endsWith('.ts') && !path.endsWith('.test.ts') ? Promise.resolve([path]) : Promise.resolve([]);
    }),
  );
  return nested.flat();
}

/** A table is "queried by" a file when the file names it in a SQL position.
 * Matching the keyword too is what keeps `orders` from matching every
 * identifier that happens to contain the word. */
function queryPattern(table: string): RegExp {
  return new RegExp(`\\b(from|join|into|update|table)\\s+(public\\.)?${table}\\b`, 'i');
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const wanted = args.find((argument) => !argument.startsWith('--'));

const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as SchemaSnapshot;
const files = await walk(sourceRoot);
const texts = new Map<string, string>();
await Promise.all(files.map(async (path) => texts.set(path, await readFile(path, 'utf8'))));

function callers(table: string): string[] {
  const pattern = queryPattern(table);
  return files.filter((path) => pattern.test(texts.get(path) ?? '')).map((path) => relative(root, path));
}

/** The module that owns a table is the one that queries it most; a table read
 * by several modules is reported as shared rather than guessed at. */
function owner(paths: string[]): string {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const match = /^src\/modules\/([^/]+)\//.exec(path);
    if (match) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return '(none)';
  return ranked.length > 1 ? `${ranked[0][0]} (+${ranked.length - 1} more)` : ranked[0][0];
}

if (!wanted) {
  const rows = Object.entries(snapshot.tables).map(([name, table]) => ({
    name,
    columns: table.columns.length,
    owner: owner(callers(name)),
  }));
  if (json) {
    console.log(JSON.stringify({ tables: rows }, null, 2));
  } else {
    const width = Math.max(...rows.map((row) => row.name.length));
    console.log(`${rows.length} tables. \`npm run table -- <name>\` for one.\n`);
    for (const row of rows) {
      console.log(`  ${row.name.padEnd(width)}  ${String(row.columns).padStart(3)} cols  ${row.owner}`);
    }
  }
  process.exit(0);
}

const table: TableSnapshot | undefined = snapshot.tables[wanted];
if (!table) {
  const near = Object.keys(snapshot.tables).filter((name) => name.includes(wanted));
  console.error(`No table \`${wanted}\`.${near.length > 0 ? ` Did you mean: ${near.join(', ')}?` : ''}`);
  process.exit(1);
}

const referencedBy = Object.entries(snapshot.tables)
  .filter(([, other]) => other.foreignKeys.some((key) => key.references.startsWith(`${wanted}(`)))
  .map(([name]) => name);
const queriedBy = callers(wanted);

if (json) {
  console.log(JSON.stringify({ name: wanted, ...table, referencedBy, queriedBy, owner: owner(queriedBy) }, null, 2));
  process.exit(0);
}

const nameWidth = Math.max(...table.columns.map((column) => column.name.length));
const typeWidth = Math.max(...table.columns.map((column) => column.type.length));

console.log(`Table: ${wanted}   owner: ${owner(queriedBy)}\n`);
console.log('Columns');
for (const column of table.columns) {
  const flags = [
    table.primaryKey.includes(column.name) ? 'PK' : '',
    column.nullable ? '' : 'NOT NULL',
    column.default ? `default ${column.default}` : '',
  ]
    .filter(Boolean)
    .join('  ');
  console.log(`  ${column.name.padEnd(nameWidth)}  ${column.type.padEnd(typeWidth)}  ${flags}`);
}

if (table.foreignKeys.length > 0) {
  console.log('\nForeign keys out');
  for (const key of table.foreignKeys) {
    console.log(`  ${key.columns.join(', ')} -> ${key.references}${key.onDelete ? ` on delete ${key.onDelete.toLowerCase()}` : ''}`);
  }
}

if (referencedBy.length > 0) {
  console.log(`\nReferenced by\n  ${referencedBy.join(', ')}`);
}

if (table.unique.length > 0) {
  console.log('\nUnique');
  for (const unique of table.unique) console.log(`  ${unique.columns.join(', ')}`);
}

if (table.indexes.length > 0) {
  console.log('\nIndexes');
  for (const index of table.indexes) {
    console.log(`  ${index.unique ? 'unique ' : ''}${index.name} ${index.columns}`);
  }
}

if (table.checks.length > 0) {
  console.log('\nChecks');
  for (const check of table.checks) console.log(`  ${check.replace(/\s+/g, ' ')}`);
}

console.log(`\nQueried by (${queriedBy.length})`);
for (const path of queriedBy.slice(0, 20)) console.log(`  ${path}`);
if (queriedBy.length > 20) console.log(`  ... and ${queriedBy.length - 20} more`);
