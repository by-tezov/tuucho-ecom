import type pg from 'pg';
import { recordActivityBestEffort, type RecordActivityInput } from './recordActivity.js';

type OperatorFields = Omit<RecordActivityInput, 'origin'>;

export async function recordOperatorActivityBestEffort(
  db: pg.Pool | pg.PoolClient,
  fields: OperatorFields,
): Promise<void> {
  await recordActivityBestEffort(db, { ...fields, origin: 'operator' });
}
