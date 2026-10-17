/** The database the in-process integration tests run against.
 *
 * Unlike the Patchright suites, which take a fresh disposable database per run
 * (see `testDatabase.ts`), this one is created once and reused: the whole point
 * of the rung is that it finishes in seconds, and creating plus migrating a
 * database costs more than every test in it.
 *
 * It is still never the developer's dev database. The name is fixed and
 * prefixed the same way disposable ones are, the login password is rotated on
 * every run, and the schema is re-migrated whenever a migration file is newer
 * than what has been applied.
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const DATABASE_NAME = 'pamsurin_test_integration';
const ROLE_NAME = 'pamsurin_test_role_integration';

function run(command: string, args: string[], capture = false): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw new Error(`[int] could not start ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`[int] ${command} failed${capture ? `: ${(result.stderr ?? '').trim()}` : ''}`);
  }
  return result.stdout ?? '';
}

function compose(args: string[], capture = false): string {
  return run(
    'docker',
    ['compose', '--env-file', '.env/.private.env', '--env-file', '.env/dev/.private.env', ...args],
    capture,
  );
}

function psql(container: string, sql: string, capture = false): string {
  return run(
    'docker',
    [
      'exec',
      container,
      'sh',
      '-lc',
      'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -At -c "$1"',
      'sh',
      sql,
    ],
    capture,
  );
}

function postgresContainer(): string {
  compose(['up', '-d']);
  const id = compose(['ps', '-q', 'postgres'], true).trim();
  if (!id) throw new Error('[int] local Postgres container is not available.');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      psql(id, 'select 1;', true);
      return id;
    } catch (error) {
      if (attempt === 29) throw error;
      spawnSync('sleep', ['0.5'], { stdio: 'ignore' });
    }
  }
  return id;
}

/** Creates the role and database when they do not exist, rotates the password,
 * and returns the connection string. Nothing here reads a private env file:
 * the superuser only ever exists inside the container. */
export function ensureIntegrationDatabase(): string {
  const container = postgresContainer();
  const password = randomBytes(24).toString('hex');

  const roleExists = psql(container, `select 1 from pg_roles where rolname = '${ROLE_NAME}';`, true).trim();
  if (roleExists) psql(container, `alter role ${ROLE_NAME} login password '${password}';`);
  else psql(container, `create role ${ROLE_NAME} login password '${password}';`);

  const databaseExists = psql(
    container,
    `select 1 from pg_database where datname = '${DATABASE_NAME}';`,
    true,
  ).trim();
  if (!databaseExists) psql(container, `create database ${DATABASE_NAME} owner ${ROLE_NAME};`);

  return `postgresql://${ROLE_NAME}:${password}@127.0.0.1:5432/${DATABASE_NAME}`;
}

/** Removes it. Only ever called by hand, when a schema change makes the reused
 * database inconsistent enough that re-migrating cannot fix it. */
function dropIntegrationDatabase(): void {
  const container = postgresContainer();
  psql(
    container,
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DATABASE_NAME}' and pid <> pg_backend_pid();`,
  );
  psql(container, `drop database if exists ${DATABASE_NAME};`);
  psql(container, `drop role if exists ${ROLE_NAME};`);
}

if (process.argv.includes('--drop')) {
  dropIntegrationDatabase();
  console.log(`Dropped ${DATABASE_NAME}.`);
}
