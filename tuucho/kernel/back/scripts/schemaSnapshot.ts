/**
 * The one machine-readable map of what the database actually holds.
 *
 * `tuucho/docs/schema/` describes the schema in prose and Mermaid, and nothing ever
 * compared that prose to a real database. Meanwhile 900-odd `query(...)` call
 * sites write raw SQL that TypeScript cannot check at all, so a renamed column
 * stays green through `npm run check` and fails in production.
 *
 * `--write` introspects the local dev database into `tuucho/docs/schema/tables.json`.
 * It is the only mode that needs a database.
 *
 * `--check` (used by `npm run check:schema`) needs no database, so it can run
 * inside the fast gate. It fails when:
 *
 * - the migration files on disk differ from the ones the snapshot was taken
 *   after, which is how a snapshot goes stale without anyone noticing;
 * - a table in the snapshot is named in no `tuucho/docs/schema/` section, so nothing
 *   explains what it stores.
 *
 * SQL identifiers are checked against this snapshot separately, by
 * `npm run check:sql`.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

process.env.APP_TARGET ??= 'dev';

const root = resolve('.');
const docsRoot = resolve(root, '../../docs');
const snapshotPath = resolve(docsRoot, 'schema/tables.json');
const rowTypesPath = resolve(root, 'src/db/rows.ts');
const adoptedPath = resolve(root, 'src/db/.adopted');
const migrationsDir = resolve(root, 'src/db/migrations');
const schemaDocsRoot = resolve(docsRoot, 'schema');

export type ColumnSnapshot = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
};

export type TableSnapshot = {
  columns: ColumnSnapshot[];
  primaryKey: string[];
  unique: { name: string; columns: string[] }[];
  foreignKeys: { columns: string[]; references: string; onDelete: string | null }[];
  indexes: { name: string; unique: boolean; columns: string }[];
  checks: string[];
};

export type SchemaSnapshot = {
  $comment: string;
  migrations: string[];
  enums: Record<string, string[]>;
  tables: Record<string, TableSnapshot>;
};

async function migrationFiles(): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  return entries.filter((name) => name.endsWith('.js')).sort();
}

export async function readSnapshot(): Promise<SchemaSnapshot> {
  return JSON.parse(await readFile(snapshotPath, 'utf8')) as SchemaSnapshot;
}

/** Everything the introspection needs, in six queries rather than one per
 * table: the schema is ~90 tables and a per-table round trip would be slow
 * enough that nobody would re-run this. */
async function introspect(): Promise<SchemaSnapshot> {
  const { pool } = await import('../src/db/pool.js');

  const columns = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `select table_name, column_name, format_type(a.atttypid, a.atttypmod) as data_type,
            case when a.attnotnull then 'NO' else 'YES' end as is_nullable,
            pg_get_expr(d.adbin, d.adrelid) as column_default
       from information_schema.columns c
       join pg_class rel on rel.relname = c.table_name and rel.relnamespace = 'public'::regnamespace
       join pg_attribute a on a.attrelid = rel.oid and a.attname = c.column_name
       left join pg_attrdef d on d.adrelid = rel.oid and d.adnum = a.attnum
      where c.table_schema = 'public'
      order by c.table_name, c.ordinal_position`,
  );

  const constraints = await pool.query<{
    table_name: string;
    constraint_name: string;
    contype: string;
    definition: string;
  }>(
    `select rel.relname as table_name, con.conname as constraint_name,
            con.contype::text as contype, pg_get_constraintdef(con.oid) as definition
       from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
      where rel.relnamespace = 'public'::regnamespace
      order by rel.relname, con.conname`,
  );

  const indexes = await pool.query<{ tablename: string; indexname: string; indexdef: string }>(
    `select tablename, indexname, indexdef from pg_indexes
      where schemaname = 'public' order by tablename, indexname`,
  );

  const enums = await pool.query<{ name: string; label: string }>(
    `select t.typname as name, e.enumlabel as label
       from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typnamespace = 'public'::regnamespace
      order by t.typname, e.enumsortorder`,
  );

  await pool.end();

  const tables: Record<string, TableSnapshot> = {};
  const table = (name: string): TableSnapshot => {
    tables[name] ??= {
      columns: [],
      primaryKey: [],
      unique: [],
      foreignKeys: [],
      indexes: [],
      checks: [],
    };
    return tables[name];
  };

  for (const row of columns.rows) {
    // `pgmigrations` is the migration runner's own bookkeeping, not part of the
    // application schema, and nothing should ever query it directly.
    // Plugin-owned tables are `plugin_<id>_…`. They come and go with enable
    // and uninstall; the kernel snapshot must not absorb them.
    if (row.table_name === 'pgmigrations' || row.table_name.startsWith('plugin_')) continue;
    table(row.table_name).columns.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
    });
  }

  const columnList = (definition: string): string[] => {
    const inside = definition.slice(definition.indexOf('(') + 1, definition.indexOf(')'));
    return inside.split(',').map((name) => name.trim().replace(/"/g, ''));
  };

  for (const row of constraints.rows) {
    if (row.table_name === 'pgmigrations' || !tables[row.table_name]) continue;
    const target = tables[row.table_name];
    if (row.contype === 'p') target.primaryKey = columnList(row.definition);
    else if (row.contype === 'u') {
      target.unique.push({ name: row.constraint_name, columns: columnList(row.definition) });
    } else if (row.contype === 'f') {
      const references = /REFERENCES ([^ ]+\([^)]*\))/.exec(row.definition)?.[1] ?? '';
      const onDelete = /ON DELETE ([A-Z ]+)/.exec(row.definition)?.[1]?.trim() ?? null;
      target.foreignKeys.push({
        columns: columnList(row.definition),
        references: references.replace(/"/g, ''),
        onDelete,
      });
    } else if (row.contype === 'c') target.checks.push(row.definition);
  }

  for (const row of indexes.rows) {
    if (row.tablename === 'pgmigrations' || !tables[row.tablename]) continue;
    tables[row.tablename].indexes.push({
      name: row.indexname,
      unique: row.indexdef.startsWith('CREATE UNIQUE'),
      columns: row.indexdef.slice(row.indexdef.indexOf('(')),
    });
  }

  const enumLabels: Record<string, string[]> = {};
  for (const row of enums.rows) (enumLabels[row.name] ??= []).push(row.label);

  return {
    $comment:
      'Generated by `npm run sync:schema` from the local dev database. Do not edit by hand: `npm run check:schema` fails when it is stale, and `npm run check:sql` validates every SQL identifier in src/ against it.',
    migrations: await migrationFiles(),
    enums: enumLabels,
    tables: Object.fromEntries(Object.entries(tables).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/** How a column comes back from `pg` in *this* application, which is not the
 * same as how Postgres describes it.
 *
 * `src/db/pool.ts` installs type parsers that keep `date` and `timestamptz` as
 * the raw text Postgres sends, because a Date round-trip truncates microsecond
 * precision and breaks cursor comparisons at a page boundary. `numeric` is a
 * string by node-postgres default, deliberately: money must not pass through a
 * float. `bigint` likewise, since it does not fit a JS number.
 *
 * Encoding that here is most of the value of generating these types: it is the
 * knowledge 215 hand-written row types each had to get right on their own. */
function typeScriptTypeOf(column: ColumnSnapshot): string {
  const base = (() => {
    if (column.type === 'boolean') return 'boolean';
    if (column.type === 'integer' || column.type === 'smallint') return 'number';
    if (column.type === 'jsonb') return 'unknown';
    // text, uuid, character(n), date, timestamptz, numeric(p,s), bigint.
    return 'string';
  })();
  return column.nullable ? `${base} | null` : base;
}

function propertyName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`;
}

/** One interface per table, plus a `Rows` map so a query can name its shape as
 * `Pick<Rows['orders'], 'id' | 'status'>` instead of restating the columns. */
function renderRowTypes(snapshot: SchemaSnapshot): string {
  const names = Object.keys(snapshot.tables);
  const pascal = (name: string): string =>
    name
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

  const interfaces = names.map((name) => {
    const table = snapshot.tables[name];
    const fields = table.columns
      .map((column) => `  ${propertyName(column.name)}: ${typeScriptTypeOf(column)};`)
      .join('\n');
    return `/** \`${name}\`${table.primaryKey.length > 0 ? `, keyed by ${table.primaryKey.join(', ')}` : ''}. */\nexport interface ${pascal(name)}Row {\n${fields}\n}`;
  });

  const map = names.map((name) => `  ${propertyName(name)}: ${pascal(name)}Row;`).join('\n');

  return `/* Generated by \`npm run sync:schema\` from the live dev database.
 * Do not edit: \`npm run check:schema\` rejects a stale copy.
 *
 * One interface per table, as the rows actually arrive through \`src/db/pool.ts\`:
 * \`date\`, \`timestamptz\`, \`numeric\` and \`bigint\` are strings here, because the
 * pool keeps them as the text Postgres sent rather than losing precision to a
 * JS Date or float.
 *
 * Use it to type a query by naming the columns it selects:
 *
 *     const { rows } = await pool.query<Pick<Rows['orders'], 'id' | 'status'>>(
 *       \`select id, status from orders where id = $1\`, [id],
 *     );
 *
 * A hand-written row type restates the schema and drifts from it silently. This
 * one turns a dropped or renamed column into a compile error.
 */

${interfaces.join('\n\n')}

/** Every table by name, for \`Pick<Rows['table'], 'column'>\`. */
export interface Rows {
${map}
}

/** Compile-time proof that a hand-written row type still matches its table.
 *
 * Some row types are worth keeping by hand: they carry the comments that say
 * *why* a column is nullable, which no generator can know. What they cannot do
 * on their own is notice that the column was renamed. Assert one like this:
 *
 *     const _orderRowMatchesTable: MatchesTable<OrderRow, 'orders'> = true;
 *     void _orderRowMatchesTable;
 *
 * It resolves to \`true\` when every field the row type declares exists on the
 * real table with a compatible type, and to a tuple naming the offending key
 * otherwise, so the failure says which column is wrong. A row type may still be
 * a subset of its table: only the columns it does declare are checked.
 */
export type MatchesTable<Row, Table extends keyof Rows> = Exclude<
  keyof Row,
  keyof Rows[Table]
> extends never
  ? Row extends Pick<Rows[Table], Extract<keyof Row, keyof Rows[Table]>>
    ? true
    : ['column type does not match the table', Table]
  : ['column is not on the table', Exclude<keyof Row, keyof Rows[Table]>];
`;
}

/** How many files type a query against the generated rows.
 *
 * Generating `rows.ts` proves nothing on its own: 215 hand-written row types
 * still restate the schema and still drift from it silently. The count of files
 * that actually import from it is ratcheted so it can rise and never fall,
 * which makes replacing them a one-way street rather than a good intention. */
/** Counts files typed against `src/db/rows.ts`. `src-test` is walked too:
 * the row-shape guards are deliberately tests (see orderRows.test.ts on why),
 * and unit tests live under `src-test/unit-test/` only — scanning `src`
 * alone would read every one of them as a dropped adopter. */
async function rowAdoption(): Promise<number> {
  const consumers = [
    ...(await walkSource(resolve(root, 'src'))),
    ...(await walkSource(resolve(root, 'src-test')).catch(() => [])),
  ];
  let adopted = 0;
  for (const path of consumers) {
    if (path === rowTypesPath) continue;
    const text = await readFile(path, 'utf8');
    if (/from\s+'[^']*db\/rows\.js'/.test(text)) adopted += 1;
  }
  return adopted;
}

async function walkSource(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walkSource(path);
      return Promise.resolve(path.endsWith('.ts') ? [path] : []);
    }),
  );
  return nested.flat();
}

async function schemaDocsText(): Promise<string> {
  const entries = (await readdir(schemaDocsRoot)).filter((name) => name.endsWith('.md'));
  const parts = await Promise.all(entries.map((name) => readFile(resolve(schemaDocsRoot, name), 'utf8')));
  return parts.join('\n');
}

const mode = process.argv.includes('--check') ? 'check' : 'write';

if (mode === 'write') {
  const snapshot = await introspect();
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(rowTypesPath, renderRowTypes(snapshot));
  const adopted = await rowAdoption();
  const floor = Number((await readFile(adoptedPath, 'utf8').catch(() => '0')).trim()) || 0;
  if (adopted > floor) await writeFile(adoptedPath, `${adopted}\n`);
  const tableCount = Object.keys(snapshot.tables).length;
  const columnCount = Object.values(snapshot.tables).reduce((total, entry) => total + entry.columns.length, 0);
  console.log(
    `Wrote tuucho/docs/schema/tables.json and src/db/rows.ts (${tableCount} tables, ${columnCount} columns, ${Object.keys(snapshot.enums).length} enums).`,
  );
} else {
  const errors: string[] = [];
  let snapshot: SchemaSnapshot | undefined;
  try {
    snapshot = await readSnapshot();
  } catch {
    errors.push('tuucho/docs/schema/tables.json is missing or unreadable. Run `npm run sync:schema`.');
  }

  if (snapshot) {
    const onDisk = await migrationFiles();
    const recorded = snapshot.migrations ?? [];
    for (const name of onDisk) {
      if (!recorded.includes(name)) {
        errors.push(`migration \`${name}\` is newer than tuucho/docs/schema/tables.json. Run \`npm run sync:schema\`.`);
      }
    }
    for (const name of recorded) {
      if (!onDisk.includes(name)) {
        errors.push(`tuucho/docs/schema/tables.json was taken after \`${name}\`, which no longer exists on disk.`);
      }
    }

    let rowTypes = '';
    try {
      rowTypes = await readFile(rowTypesPath, 'utf8');
    } catch {
      errors.push('src/db/rows.ts is missing. Run `npm run sync:schema`.');
    }
    if (rowTypes && rowTypes !== renderRowTypes(snapshot)) {
      errors.push('src/db/rows.ts does not match tuucho/docs/schema/tables.json. Run `npm run sync:schema`.');
    }

    const adopted = await rowAdoption();
    const floor = Number((await readFile(adoptedPath, 'utf8').catch(() => '0')).trim()) || 0;
    if (adopted < floor) {
      errors.push(
        `row-type adoption fell from ${floor} to ${adopted} files importing src/db/rows.ts. ` +
          'A hand-written row type restates the schema and drifts from it silently.',
      );
    }

    const docs = await schemaDocsText();
    for (const name of Object.keys(snapshot.tables)) {
      if (!docs.includes(name)) {
        errors.push(`table \`${name}\` is named in no tuucho/docs/schema/ section.`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Schema check failed (${errors.length}):`);
    for (const error of errors.slice(0, 40)) console.error(`- ${error}`);
    if (errors.length > 40) console.error(`- ... and ${errors.length - 40} more.`);
    process.exit(1);
  }

  const tableCount = Object.keys(snapshot?.tables ?? {}).length;
  console.log(
    `Schema check passed (${tableCount} tables, snapshot current with ${snapshot?.migrations.length} migrations, ${await rowAdoption()} files typed against src/db/rows.ts).`,
  );
}
