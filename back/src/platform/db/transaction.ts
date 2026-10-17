import type pg from 'pg';

/**
 * Runs `work` inside one transaction on a dedicated pool client: `commit`
 * when it resolves, `rollback` and rethrow when it throws, and the client is
 * released either way. A failed rollback (the connection already broken) never
 * masks the error that caused it.
 *
 * Replaces the connect / begin / commit / rollback / release block every
 * transactional use case used to spell out by hand. `work` must not hold the
 * transaction open across a network call (see AGENTS.md).
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
