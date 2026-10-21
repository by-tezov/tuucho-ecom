import type pg from 'pg';

function isPoolClient(db: pg.Pool | pg.PoolClient): db is pg.PoolClient {
  return typeof (db as pg.PoolClient).release === 'function';
}

/**
 * Independent reads. A pool runs them at once (one connection each). A single
 * connection cannot start a query while another is still queued: pg@9 removes
 * that, and current pg warns. A PoolClient therefore runs them in order.
 */
export async function queryTogether<const T extends readonly (() => Promise<unknown>)[]>(
  db: pg.Pool | pg.PoolClient,
  tasks: T,
): Promise<{ -readonly [K in keyof T]: T[K] extends () => Promise<infer R> ? R : never }> {
  if (isPoolClient(db)) {
    const out: unknown[] = [];
    for (const task of tasks) out.push(await task());
    return out as { -readonly [K in keyof T]: T[K] extends () => Promise<infer R> ? R : never };
  }
  return Promise.all(tasks.map((task) => task())) as Promise<{
    -readonly [K in keyof T]: T[K] extends () => Promise<infer R> ? R : never;
  }>;
}
