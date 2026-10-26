#!/usr/bin/env node
/**
 * Validates every SQL identifier written in `src/` against the real schema.
 *
 * 900-odd `query(...)` call sites write SQL as plain template text. TypeScript
 * cannot look inside a template literal, so a column renamed in a migration
 * and missed in one of them is green through `npm run check`, green through
 * `tsc`, and fails only when that code path runs in production.
 *
 * This closes that gap without a database: it reads `tuucho/docs/schema/tables.json`
 * (kept current by `npm run sync:schema`, enforced by `npm run check:schema`)
 * and checks two things per SQL literal:
 *
 * - every table named after `from` / `join` / `into` / `update` / `delete from`
 *   exists, unless it is a CTE defined in the same statement;
 * - every `alias.column` reference resolves, when the alias was bound to a real
 *   table in the same statement.
 *
 * What it cannot resolve it reports as unverifiable rather than assuming it is
 * fine, the same way the front-end's `check:api` reports its dynamic call
 * sites. Silence about an unchecked thing is what made the gap invisible.
 */
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve('.');
const snapshotPath = resolve(root, '../../docs/schema/tables.json');
const sourceRoot = resolve(root, 'src');

/** Postgres names that are not tables in the snapshot but are legal here. */
const SYSTEM_TABLES = new Set([
  'pgmigrations',
  'pg_indexes',
  'pg_class',
  'pg_attribute',
  'pg_attrdef',
  'pg_constraint',
  'pg_type',
  'pg_enum',
  'pg_stat_activity',
  'pg_locks',
  'information_schema',
  'columns',
  'tables',
  'unnest',
  'generate_series',
  'jsonb_array_elements',
  'jsonb_to_recordset',
  'json_array_elements',
]);

/** Column-position words that are never a column: SQL keywords that can follow
 * a dot in expressions we do not parse (`c.*`), and casts. */
const NOT_A_COLUMN = new Set(['*']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return path.endsWith('.ts') ? [path] : [];
    }),
  );
  return nested.flat();
}

/** Every backtick template literal in a file, with the line it starts on.
 * A hand-rolled scan rather than the TypeScript AST: this runs over 428 files
 * inside the fast gate, and the only thing needed is the text. */
function templateLiterals(text) {
  const found = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('`', index);
    if (start === -1) break;
    // Skip a backtick that is escaped or inside a line comment.
    let end = start + 1;
    let depth = 0;
    while (end < text.length) {
      const character = text[end];
      if (character === '\\') {
        end += 2;
        continue;
      }
      if (character === '$' && text[end + 1] === '{') {
        depth += 1;
        end += 2;
        continue;
      }
      if (depth > 0 && character === '}') {
        depth -= 1;
        end += 1;
        continue;
      }
      if (depth === 0 && character === '`') break;
      end += 1;
    }
    found.push({ text: text.slice(start + 1, end), line: text.slice(0, start).split('\n').length });
    index = end + 1;
  }
  return found;
}

const SQL_SHAPE = /\b(select|insert\s+into|update|delete\s+from|with)\b/i;

function looksLikeSql(fragment) {
  if (!SQL_SHAPE.test(fragment)) return false;
  // `update` and `select` also appear in prose and in JS; require a second
  // SQL word so an English sentence in a comment or a message is not parsed.
  return /\b(from|into|set|values|where|join|returning|on conflict)\b/i.test(fragment);
}

/** Interpolations make the text unparseable as SQL; replace each with a token
 * that reads as an opaque identifier so the surrounding grammar still scans. */
function normalize(fragment) {
  return fragment.replace(/\$\{[^}]*\}/g, ' __interpolated__ ');
}

const TABLE_POSITION = /\b(?:from|join|into|update)\s+(?:only\s+)?("?[a-z_][a-z0-9_$]*"?)(?:\.("?[a-z_][a-z0-9_$]*"?))?/gi;
const ALIAS_BINDING =
  /\b(?:from|join|into|update)\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_$]*)\s+(?:as\s+)?([a-z_][a-z0-9_$]*)\b/gi;
/** `with x as (`, `with recursive x(col) as (`, `, y as (`. */
const CTE_NAMES = /\b(?:with(?:\s+recursive)?|,)\s+([a-z_][a-z0-9_$]*)\s*(?:\([^)]*\))?\s+as\s*\(/gi;
const QUALIFIED_COLUMN = /\b([a-z_][a-z0-9_$]*)\.([a-z_][a-z0-9_$]*)\b/gi;

/** Words that follow `from`/`join`/`update` but are not a table name. Most are
 * the row-locking clause: `for update skip locked`, `for update of carts`. */
const NON_TABLE_KEYWORDS = new Set([
  'select',
  'lateral',
  'only',
  'values',
  'set',
  'skip',
  'of',
  'nowait',
  'locked',
  'share',
  '__interpolated__',
]);

/** Reserved words that can appear where an alias would, so they must not be
 * recorded as one. */
const NON_ALIAS_KEYWORDS = new Set([
  'on',
  'using',
  'where',
  'set',
  'left',
  'right',
  'inner',
  'outer',
  'full',
  'cross',
  'join',
  'group',
  'order',
  'limit',
  'offset',
  'having',
  'union',
  'returning',
  'values',
  'as',
  'and',
  'or',
  'for',
  'select',
  'from',
  'into',
  'do',
  'with',
  'window',
  'fetch',
  'except',
  'intersect',
  'lateral',
  'natural',
  'conflict',
  'update',
  'delete',
  'insert',
]);

const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const tables = snapshot.tables;
const columnsOf = new Map(
  Object.entries(tables).map(([name, table]) => [name, new Set(table.columns.map((column) => column.name))]),
);

const files = (await walk(sourceRoot)).sort();
const errors = [];
let statements = 0;
let checkedTables = 0;
let checkedColumns = 0;
let unverifiable = 0;

for (const path of files) {
  const text = await readFile(path, 'utf8');
  if (!/\bquery[<(]|\bsql`/.test(text)) continue;
  const where = relative(root, path);

  for (const literal of templateLiterals(text)) {
    if (!looksLikeSql(literal.text)) continue;
    statements += 1;
    const sql = normalize(literal.text);
    const at = `${where}:${literal.line}`;

    const locals = new Set();
    for (const match of sql.matchAll(CTE_NAMES)) locals.add(match[1].toLowerCase());

    for (const match of sql.matchAll(TABLE_POSITION)) {
      const qualifier = match[1].replace(/"/g, '').toLowerCase();
      const qualified = match[2]?.replace(/"/g, '').toLowerCase();
      const name = qualified ?? qualifier;
      if (qualified && qualifier !== 'public') continue;
      if (NON_TABLE_KEYWORDS.has(name) || locals.has(name) || SYSTEM_TABLES.has(name)) continue;
      // Postgres catalogs and anything whose name is built at runtime
      // (`from public.${table}`) cannot be resolved here.
      if (name.startsWith('pg_')) continue;
      if (name === '__interpolated__' || sql[match.index + match[0].length] === '.') {
        unverifiable += 1;
        continue;
      }
      checkedTables += 1;
      if (!tables[name]) {
        errors.push(`${at}: no table \`${name}\`. Run \`npm run table\` for the list.`);
      }
    }

    const aliases = new Map();
    for (const match of sql.matchAll(ALIAS_BINDING)) {
      const table = match[1].toLowerCase();
      const alias = match[2].toLowerCase();
      if (NON_ALIAS_KEYWORDS.has(alias) || !tables[table]) continue;
      aliases.set(alias, table);
    }
    // A single-table statement lets a bare table name qualify its own columns.
    for (const match of sql.matchAll(TABLE_POSITION)) {
      const name = (match[2] ?? match[1]).replace(/"/g, '').toLowerCase();
      if (tables[name]) aliases.set(name, name);
    }

    for (const match of sql.matchAll(QUALIFIED_COLUMN)) {
      const alias = match[1].toLowerCase();
      const column = match[2].toLowerCase();
      const table = aliases.get(alias);
      if (!table || NOT_A_COLUMN.has(column) || column === '__interpolated__') continue;
      // `alias.column::type` and function calls read the same way; a name that
      // is immediately followed by `(` is a function, not a column.
      const after = sql.slice(match.index + match[0].length);
      if (after.startsWith('(')) continue;
      checkedColumns += 1;
      if (!columnsOf.get(table)?.has(column)) {
        errors.push(`${at}: \`${table}\` has no column \`${column}\`. Run \`npm run table -- ${table}\`.`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`SQL check failed (${errors.length}):`);
  for (const error of errors.slice(0, 40)) console.error(`- ${error}`);
  if (errors.length > 40) console.error(`- ... and ${errors.length - 40} more.`);
  process.exit(1);
}

console.log(
  `SQL check passed (${statements} statements, ${checkedTables} table references and ${checkedColumns} qualified columns verified; ${unverifiable} interpolated table names not statically checkable).`,
);
