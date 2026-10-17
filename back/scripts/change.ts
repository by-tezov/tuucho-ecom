/**
 * The two changes that actually recur, with every companion step named.
 *
 * `npm run scaffold` covers starting a *new* feature. The task that comes up
 * far more often is adding a field or an endpoint to an existing one, and that
 * spans up to eleven artifacts: a migration, the schema snapshot, the schema
 * prose, an application function, a contract type, the generated copy of it in
 * the front, a front API module, a component, seven locale files, an API
 * documentation section and the route inventory. Half of them are checked and
 * half were remembered, which is how a change ships three quarters finished.
 *
 * This does two things. It writes what is purely mechanical (a dated migration
 * stub, in the right place, with the right runner signature), and it prints the
 * remaining steps in dependency order, each naming the command that proves it.
 * A step with no check behind it says so, because those are the ones that
 * actually get skipped.
 *
 * ```bash
 * npm run change -- field <table> <column> [--type text] [--not-null]
 * npm run change -- endpoint <feature> <METHOD> <path>
 * ```
 *
 * It never overwrites an existing file.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const migrationsDir = resolve(root, 'src/db/migrations');
const featuresPath = resolve(root, 'docs/features.json');
const snapshotPath = resolve(root, 'docs/schema/tables.json');

type FeatureEntry = {
  apiDoc?: string;
  schemaDoc?: string;
  module?: string;
  frontApi?: string[];
  frontComponents?: string[];
  i18n?: string[];
  tests?: string[];
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function flagValue(args: string[], flag: string): string | undefined {
  const position = args.indexOf(flag);
  return position === -1 ? undefined : args[position + 1];
}

/** Numbered like the existing migrations: a millisecond timestamp, so the
 * runner's lexical ordering is also chronological. */
function migrationName(slug: string): string {
  return `${Date.now()}_${slug}.js`;
}

function printSteps(title: string, steps: { text: string; proof?: string }[]): void {
  console.log(`\n${title}\n`);
  steps.forEach((step, index) => {
    console.log(`  ${String(index + 1).padStart(2)}. ${step.text}`);
    console.log(`      ${step.proof ? `proved by: ${step.proof}` : 'no check covers this. It is on you.'}`);
  });
  console.log('');
}

const args = process.argv.slice(2);
const subcommand = args[0];

if (subcommand === 'field') {
  const [, table, column] = args;
  if (!table || !column) {
    fail('Usage: npm run change -- field <table> <column> [--type text] [--not-null] [--default <sql>]');
  }
  if (!/^[a-z][a-z0-9_]*$/.test(table) || !/^[a-z][a-z0-9_]*$/.test(column)) {
    fail('A table and a column must both be lower_snake_case.');
  }

  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
    tables: Record<string, { columns: { name: string }[] }>;
  };
  const target = snapshot.tables[table];
  if (!target) {
    fail(`No table \`${table}\` in docs/schema/tables.json. Run \`npm run table\` for the list.`);
  }
  if (target.columns.some((existing) => existing.name === column)) {
    fail(`\`${table}.${column}\` already exists. Run \`npm run table -- ${table}\`.`);
  }

  const type = flagValue(args, '--type') ?? 'text';
  const notNull = args.includes('--not-null');
  const defaultSql = flagValue(args, '--default');
  if (notNull && defaultSql === undefined) {
    fail(
      'A NOT NULL column needs --default: the previously deployed version keeps inserting rows without it, ' +
        'and a migration has to stay compatible with the version it is deployed alongside.',
    );
  }

  const path = resolve(migrationsDir, migrationName(`${table}_${column}`));
  if (await exists(path)) fail(`${path} already exists.`);

  const clause = [
    `ADD COLUMN IF NOT EXISTS ${column} ${type}`,
    defaultSql === undefined ? '' : ` DEFAULT ${defaultSql}`,
    notNull ? ' NOT NULL' : '',
  ].join('');

  await writeFile(
    path,
    `/** Adds \`${table}.${column}\`.
 *
 * Additive and compatible with the previously deployed application version: a
 * code rollback cannot undo a migration, so this may never rename or drop
 * anything the running version still reads.
 *
 * One statement per pgm.sql() so LWS Postgres can apply it.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(\`
    ALTER TABLE public.${table}
      ${clause}
  \`);
};
`,
  );

  console.log(`Wrote src/db/migrations/${path.split('/').pop()}`);
  printSteps(`Adding ${table}.${column}:`, [
    {
      text: 'Review the migration. Additive only, and safe beside the deployed version.',
      proof: 'nothing. This is the one that cannot be automated.',
    },
    { text: 'npm run operation -- database-migrate --dev', proof: 'the command fails if the SQL is wrong' },
    { text: 'npm run sync:schema', proof: 'npm run check:schema' },
    { text: `Document the column in docs/schema/, next to the rest of ${table}.`, proof: 'npm run check:schema' },
    { text: 'Read and write it in the owning application/ or infrastructure/ unit.', proof: 'npm run check:sql' },
    { text: 'Add it to the response type in src/contract/ if a client sees it.', proof: 'npm run typecheck' },
    { text: 'npm run sync:contract', proof: 'npm run check:contract' },
    { text: 'Use it in ../pamsurin-front and add any new copy with npm run i18n.', proof: 'npm --prefix ../pamsurin-front run check' },
    { text: 'Document the field in docs/api/ if it is on the wire.', proof: 'npm run check:routes' },
    { text: 'Cover the new behaviour in src-test/int/.', proof: 'npm run test:int' },
    { text: 'npm run check:all', proof: 'itself' },
  ]);
  process.exit(0);
}

if (subcommand === 'endpoint') {
  const [, feature, method, path] = args;
  if (!feature || !method || !path) {
    fail('Usage: npm run change -- endpoint <feature> <METHOD> <path>');
  }
  const verb = method.toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)) {
    fail(`\`${method}\` is not an HTTP method this API uses.`);
  }
  if (!path.startsWith('/')) fail('A path starts with `/`. There is no `/api` prefix on this service.');

  const features = JSON.parse(await readFile(featuresPath, 'utf8')) as Record<string, FeatureEntry>;
  const entry = features[feature];
  if (!entry) {
    const names = Object.keys(features).filter((name) => !name.startsWith('$'));
    fail(`No feature \`${feature}\` in docs/features.json. Known: ${names.join(', ')}.`);
  }

  const routes = JSON.parse(await readFile(resolve(root, 'docs/api/routes.json'), 'utf8')) as {
    publicSurface: { method: string; path: string }[];
    opsSurface: { method: string; path: string }[];
  };
  const clash = [...routes.publicSurface, ...routes.opsSurface].find(
    (route) => route.method === verb && route.path === path,
  );
  if (clash) fail(`${verb} ${path} is already served. Run \`npm run feature -- ${feature}\` to see its routes.`);

  console.log(`\n${verb} ${path} on \`${feature}\`\n`);
  console.log(`  module        ${entry.module ?? '(none)'}`);
  console.log(`  api doc       ${entry.apiDoc ?? '(none)'}`);
  console.log(`  front api     ${(entry.frontApi ?? []).join(', ') || '(none)'}`);
  console.log(`  i18n          ${(entry.i18n ?? []).join(', ') || '(none)'}`);
  console.log(`  tests         ${(entry.tests ?? []).join(', ') || '(none)'}`);

  printSteps('Steps, in the order each one turns on the check that guards the next:', [
    {
      text: `Add the handler under ${entry.module ?? 'src/modules/<feature>'}/http/, validated with zod at the boundary.`,
      proof: 'npm run check:architecture (router size, error envelope shape)',
    },
    {
      text: 'Put the workflow in application/ and the rule in domain/. The router only parses and maps.',
      proof: 'npm run check:architecture (layer and tier direction)',
    },
    { text: 'npm run sync:routes', proof: 'npm run check:routes' },
    { text: `Document it in ${entry.apiDoc ?? 'docs/api/'}: path, input, output, statuses, errors, auth.`, proof: 'npm run check:routes' },
    { text: 'Reuse an existing error code, or add one deliberately.', proof: 'npm run sync:errors, then npm run check:errors' },
    { text: 'Declare the payload types in src/contract/ and bind the presenter to them.', proof: 'npm run typecheck and the src/contract/.adopted ratchet' },
    { text: 'npm run sync:contract', proof: 'npm run check:contract' },
    { text: `Call it from ${(entry.frontApi ?? ['src/api/<module>.ts']).join(' or ')}.`, proof: 'npm --prefix ../pamsurin-front run check:api' },
    { text: 'Add any new visible copy with npm --prefix ../pamsurin-front run i18n.', proof: 'npm --prefix ../pamsurin-front run check:i18n' },
    { text: 'Cover it in src-test/int/ against a real database.', proof: 'npm run test:int' },
    { text: 'npm run check:all', proof: 'itself' },
  ]);
  process.exit(0);
}

console.error('Usage:');
console.error('  npm run change -- field <table> <column> [--type text] [--not-null] [--default <sql>]');
console.error('  npm run change -- endpoint <feature> <METHOD> <path>');
process.exit(1);
