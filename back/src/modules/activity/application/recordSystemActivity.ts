import type pg from 'pg';
import { recordActivityBestEffort, type RecordActivityInput } from './recordActivity.js';

type SystemFields = Omit<RecordActivityInput, 'origin' | 'actorLabel'> & {
  /** French job name shown as the actor (expédition, fidélité, …). */
  actorLabel: string;
};

export async function recordSystemActivityBestEffort(
  db: pg.Pool | pg.PoolClient,
  fields: SystemFields,
): Promise<void> {
  await recordActivityBestEffort(db, { ...fields, origin: 'system' });
}
