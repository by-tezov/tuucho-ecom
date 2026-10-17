/**
 * The in-process integration stack: the real app, a real database, no browser,
 * no front-end, no second process.
 *
 * It exists to fill the gap between the domain unit tests, which run in under
 * a second but only cover pure `domain/` code, and the Patchright suites,
 * which cover everything but need a disposable database, a backend process, a
 * front process and a browser. That gap is where `application/` and
 * `infrastructure/` live, which is most of the code, so most changes had no
 * cheap way to be proved correct.
 *
 * Everything here is process-wide and set up once, which is why
 * `npm run test:int` runs with `--experimental-test-isolation=none`: one
 * process, one app, one pool, one migrated database reused across runs.
 *
 * Isolation between tests is `resetDatabase()`, a single TRUNCATE of every
 * application table. Transactions are deliberately *not* used for isolation:
 * the code under test opens its own, and wrapping it would change the very
 * behaviour (commit visibility, lock contention, deadlock retry) these tests
 * exist to cover.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after } from 'node:test';
import { ensureIntegrationDatabase } from '../../../scripts/integrationDatabase.js';

process.env.APP_TARGET ??= 'dev';
// Chosen before any module that reads config is imported: `config.databaseUrl`
// prefers PAM_TEST_DATABASE_URL, which is how the Patchright runs redirect too.
process.env.PAM_TEST_DATABASE_URL ??= ensureIntegrationDatabase();

const { runner } = await import('node-pg-migrate');
const migrationsDir = resolve('src/db/migrations');
await runner({
  databaseUrl: process.env.PAM_TEST_DATABASE_URL,
  dir: migrationsDir,
  direction: 'up',
  migrationsTable: 'pgmigrations',
  checkOrder: false,
  log: () => {},
});

const { createApp } = await import('../../../src/app.js');
const { pool } = await import('../../../src/db/pool.js');

const app = createApp();
const server: Server = await new Promise((resolveServer) => {
  const listening = app.listen(0, '127.0.0.1', () => resolveServer(listening));
});
export const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** Every application table, from the same snapshot `npm run check:sql` uses,
 * so a new table is covered by the reset the moment it is introspected.
 *
 * Minus the ones the migrations themselves populate. Those hold schema
 * constants (`roles`, `address_countries`, the singleton settings rows), not
 * test data: emptying them would leave the database in a state no migration
 * ever produces, and the first foreign key to `roles` would fail. Deriving the
 * exclusion from the migration text means a future seeded table is excluded
 * the day it is added. */
const migrationText = (
  await Promise.all(
    (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFile(resolve(migrationsDir, name), 'utf8')),
  )
).join('\n');
const seededByMigrations = new Set(
  [...migrationText.matchAll(/insert\s+into\s+(?:public\.)?([a-z_0-9]+)/gi)].map((match) =>
    match[1].toLowerCase(),
  ),
);

const tableNames: string[] = Object.keys(
  JSON.parse(await readFile(resolve('docs/schema/tables.json'), 'utf8')).tables as Record<string, unknown>,
).filter((name) => !seededByMigrations.has(name));
for (const name of tableNames) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`[int] refusing to reset an unexpected table name: ${name}`);
}

/** Truncating all 96 tables unconditionally costs about 850ms, which at one
 * reset per test would dominate the whole rung. Almost every test dirties a
 * handful, so this asks each table whether it holds a row and truncates only
 * those: 1 to 40ms in practice, and exact, unlike the planner's row estimates
 * or the statistics collector's counters. */
const resetStatement = `
do $$
declare
  candidate text;
  present boolean;
  dirty text[] := '{}';
begin
  foreach candidate in array array[${tableNames.map((name) => `'${name}'`).join(', ')}] loop
    execute format('select exists (select 1 from public.%I limit 1)', candidate) into present;
    if present then dirty := dirty || candidate; end if;
  end loop;
  if array_length(dirty, 1) is not null then
    execute 'truncate table '
      || (select string_agg(format('public.%I', name), ', ') from unnest(dirty) as name)
      || ' restart identity cascade';
  end if;
end $$;`;

export async function resetDatabase(): Promise<void> {
  await pool.query(resetStatement);
}

// One teardown for the whole run, not one per file: `--experimental-test-isolation=none`
// means every test file shares this server and this pool.
after(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  await pool.end();
});

export type ApiResponse<T> = {
  status: number;
  headers: Headers;
  body: T;
  text: string;
};

export type ApiOptions = {
  /** Bearer token for `/account/*` and other authenticated routes. */
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Fails the test when the status differs, so a broken call reports the
   * status and the payload rather than a confusing shape assertion later. */
  expectStatus?: number;
};

/** One request against the real app. JSON in, parsed JSON out; a non-JSON
 * body comes back as `text` with `body` left undefined. */
export async function api<T = unknown>(
  method: string,
  path: string,
  options: ApiOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...options.headers,
  };
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: T | undefined;
  try {
    body = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    body = undefined;
  }
  if (options.expectStatus !== undefined && response.status !== options.expectStatus) {
    throw new Error(
      `${method} ${path} answered ${response.status}, expected ${options.expectStatus}. Body: ${text.slice(0, 500)}`,
    );
  }
  return { status: response.status, headers: response.headers, body: body as T, text };
}

export { pool };
