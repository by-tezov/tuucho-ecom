import pg from 'pg';
import { config } from '../config/env.js';

// node-postgres parses `date`/`timestamptz` columns into JS Date objects by
// default, which silently corrupts them the moment they're used as strings
// again (e.g. products.service.ts's activeFeaturedPeriod for `date`
// columns, or its cursor logic for `created_at`: a Date round-trip
// truncates Postgres's microsecond precision to milliseconds, which can
// make an adjacent row wrongly compare equal at a page boundary) — every
// timestamp field in this codebase (featured_from, creation_date,
// created_at, updated_at) is typed and handled as a plain string, so keep
// them as the raw text Postgres sends.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => value);

// node-postgres' own defaults are max 10 with connectionTimeoutMillis 0 —
// "wait forever". On LWS's managed Postgres that turns one slow query into an
// outage: ten connections get pinned, and every later request queues without
// ever erroring, so the API stops responding instead of shedding load. Bound
// all four, and give each connection a server-side statement_timeout so a
// runaway query releases its connection on its own.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.database.poolMax,
  idleTimeoutMillis: config.database.idleTimeoutMs,
  connectionTimeoutMillis: config.database.connectionTimeoutMs,
  // Travels in the connection startup packet, so a new connection arrives
  // already bounded — no setup query to race the caller's first one. Doing
  // this from a `pool.on('connect')` handler instead issues a second query on
  // a client the pool has already handed out, which node-postgres deprecated
  // (it still queues them, but it warns and breaks in pg@9).
  // `DATABASE_STATEMENT_TIMEOUT=off` drops the parameter entirely, for a
  // provider behind a pooler that refuses unknown startup options.
  ...(config.database.statementTimeoutMs > 0
    ? { options: `-c statement_timeout=${config.database.statementTimeoutMs}` }
    : {}),
});

// A pool error (server restart, dropped idle connection) is emitted on the
// pool itself; without a listener Node treats it as an unhandled 'error' event
// and takes the process down.
pool.on('error', (error) => {
  console.error('[db] idle client error', error);
});
