import type pg from 'pg';
import type { AuthenticatedUser } from '../../../types.js';
import { adminActorFields } from './adminActor.js';
import {
  recordActivity,
  recordActivityBestEffort,
  type RecordActivityInput,
} from './recordActivity.js';

type AdminActivityFields = Omit<
  RecordActivityInput,
  'origin' | 'actorUserId' | 'actorEmail' | 'actorLabel'
>;

/** Journal row for a browser admin action, same transaction when `db` is a client. */
export async function recordAdminActivity(
  db: pg.Pool | pg.PoolClient,
  user: AuthenticatedUser,
  fields: AdminActivityFields,
): Promise<string> {
  return recordActivity(db, { ...fields, ...adminActorFields(user) });
}

export async function recordAdminActivityBestEffort(
  db: pg.Pool | pg.PoolClient,
  user: AuthenticatedUser,
  fields: AdminActivityFields,
): Promise<void> {
  await recordActivityBestEffort(db, { ...fields, ...adminActorFields(user) });
}
