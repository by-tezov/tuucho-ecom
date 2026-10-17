/** Disposable PostgreSQL database for Patchright runs.
 *
 * Tests must never connect to the developer's normal dev database.  This
 * helper creates an empty, per-run database and login role inside the local
 * Docker Postgres, then removes both in cleanup.  It intentionally obtains
 * Docker's configured superuser only inside the container, so no private
 * environment value is read or printed by the test runner.
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export interface DisposableTestDatabase {
  databaseName: string;
  roleName: string;
  url: string;
}

const PREFIX = 'pamsurin_test_';

function run(command: string, args: string[], options: { capture?: boolean } = {}): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw new Error(`[test] could not start ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const details = options.capture ? (result.stderr ?? '').trim() : '';
    throw new Error(`[test] ${command} failed${details ? `: ${details}` : ''}`);
  }
  return result.stdout ?? '';
}

function compose(args: string[], capture = false): string {
  return run(
    'docker',
    ['compose', '--env-file', '.env/.private.env', '--env-file', '.env/dev/.private.env', ...args],
    {
      capture,
    },
  );
}

function postgresContainer(): string {
  compose(['up', '-d']);
  const id = compose(['ps', '-q', 'postgres'], true).trim();
  if (!id) throw new Error('[test] local Postgres container is not available.');
  waitForPostgres(id);
  return id;
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
    { capture },
  );
}

/** `docker compose up -d` returns as soon as the container exists, while
 * PostgreSQL may still be replaying its WAL and reject connections with
 * "the database system is starting up". Keep the first test-run operation
 * from racing that initialization. */
function waitForPostgres(container: string): void {
  const attempts = 30;
  let lastError = 'unknown readiness error';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      psql(container, 'select 1;', true);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < attempts - 1) spawnSync('sleep', ['0.5'], { stdio: 'ignore' });
    }
  }
  throw new Error(`[test] local Postgres did not become ready after ${attempts * 0.5}s: ${lastError}`);
}

function assertTestName(value: string): void {
  if (!new RegExp(`^${PREFIX}[a-z0-9_]+$`).test(value)) {
    throw new Error(`[test] refusing to operate on a non-test database name.`);
  }
}

function drop(container: string, databaseName: string, roleName: string): void {
  assertTestName(databaseName);
  assertTestName(roleName);
  // `DROP DATABASE` may not run inside a multi-statement query transaction,
  // so keep each administrative statement in its own psql invocation.
  psql(
    container,
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${databaseName}' and pid <> pg_backend_pid();`,
  );
  psql(container, `drop database if exists ${databaseName};`);
  psql(container, `drop role if exists ${roleName};`);
}

/** Remove databases left behind by an interrupted earlier test command. */
export function removeOrphanedTestDatabases(): void {
  const container = postgresContainer();
  const databases = psql(
    container,
    `select datname from pg_database where datname like '${PREFIX}%' order by datname;`,
    true,
  )
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
  for (const databaseName of databases) {
    const roleName = databaseName.replace(`${PREFIX}`, `${PREFIX}role_`);
    console.error(`[test] removing interrupted test database ${databaseName}`);
    try {
      drop(container, databaseName, roleName);
    } catch {
      // A previous crash can leave pg_database/pg_authid out of sync. Do not
      // block a new disposable run on leftover cleanup.
      console.error(`[test] leftover ${databaseName} was not fully removed; continuing`);
    }
  }

  // A drop that terminated backends and removed the database can still leave
  // the login role when the runner was interrupted between those statements.
  const roles = psql(
    container,
    `select rolname from pg_roles where rolname like '${PREFIX}role_%' order by rolname;`,
    true,
  )
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
  for (const roleName of roles) {
    assertTestName(roleName);
    console.error(`[test] removing interrupted test role ${roleName}`);
    try {
      psql(container, `drop role if exists ${roleName};`);
    } catch {
      console.error(`[test] leftover role ${roleName} was not removed; continuing`);
    }
  }
}

export function createDisposableTestDatabase(): DisposableTestDatabase {
  const container = postgresContainer();
  const suffix = `${process.pid}_${randomBytes(8).toString('hex')}`;
  const databaseName = `${PREFIX}${suffix}`;
  const roleName = `${PREFIX}role_${suffix}`;
  const password = randomBytes(24).toString('hex');
  psql(container, `create role ${roleName} login password '${password}';`);
  try {
    psql(container, `create database ${databaseName} owner ${roleName};`);
  } catch (error) {
    drop(container, databaseName, roleName);
    throw error;
  }
  return {
    databaseName,
    roleName,
    url: `postgresql://${roleName}:${password}@127.0.0.1:5432/${databaseName}`,
  };
}

export function destroyDisposableTestDatabase(database: DisposableTestDatabase): void {
  const container = postgresContainer();
  drop(container, database.databaseName, database.roleName);
}
