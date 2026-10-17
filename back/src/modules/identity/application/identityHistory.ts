import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';

export type IdentityEventKind =
  | 'account_created'
  | 'email_changed'
  | 'google_linked'
  | 'google_unlinked'
  | 'facebook_linked'
  | 'facebook_unlinked'
  | 'apple_linked'
  | 'apple_unlinked';

export interface IdentityEventInput {
  userId: string;
  kind: IdentityEventKind;
  email?: string | null;
  previousEmail?: string | null;
  providerSubject?: string | null;
  backfilled?: boolean;
  /** When set (e.g. seed from users.created_at), overrides DB default. */
  createdAt?: Date | string;
}

interface EncryptedIdentityEventRow {
  id: string;
  user_id: string;
  kind: IdentityEventKind;
  email: string | null;
  email_lookup: string | null;
  previous_email: string | null;
  previous_email_lookup: string | null;
  provider_subject: string | null;
  backfilled: boolean;
  created_at: string;
}

export interface IdentityEventRow {
  id: string;
  userId: string;
  kind: IdentityEventKind;
  email: string | null;
  previousEmail: string | null;
  providerSubject: string | null;
  backfilled: boolean;
  createdAt: string;
}

function decryptEventRow(row: EncryptedIdentityEventRow): IdentityEventRow {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    email: decryptPii(row.email),
    previousEmail: decryptPii(row.previous_email),
    providerSubject: row.provider_subject,
    backfilled: row.backfilled,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** Append one identity-change row. Call on the same connection as the mutation. */
export async function recordIdentityEvent(
  db: pg.Pool | pg.PoolClient,
  input: IdentityEventInput,
): Promise<void> {
  const email = input.email?.trim().toLowerCase() || null;
  const previousEmail = input.previousEmail?.trim().toLowerCase() || null;
  await db.query(
    `insert into user_identity_events (
       id, user_id, kind, email, email_lookup,
       previous_email, previous_email_lookup, provider_subject, backfilled, created_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::timestamptz, now()))`,
    [
      randomUUID(),
      input.userId,
      input.kind,
      email ? encryptPii(email) : null,
      email ? emailLookupHash(email) : null,
      previousEmail ? encryptPii(previousEmail) : null,
      previousEmail ? emailLookupHash(previousEmail) : null,
      input.providerSubject ?? null,
      input.backfilled === true,
      input.createdAt ? new Date(input.createdAt).toISOString() : null,
    ],
  );
}

/** Account insert: always `account_created`, plus a linked event per attached provider. */
export async function recordAccountCreatedEvents(
  db: pg.Pool | pg.PoolClient,
  user: {
    id: string;
    email: string;
    google_sub: string | null;
    google_email: string | null;
    facebook_user_id: string | null;
    facebook_email: string | null;
    apple_sub: string | null;
    apple_email: string | null;
  },
): Promise<void> {
  await recordIdentityEvent(db, {
    userId: user.id,
    kind: 'account_created',
    email: user.email,
  });
  if (user.google_sub) {
    await recordIdentityEvent(db, {
      userId: user.id,
      kind: 'google_linked',
      email: user.google_email ?? user.email,
      providerSubject: user.google_sub,
    });
  }
  if (user.facebook_user_id) {
    await recordIdentityEvent(db, {
      userId: user.id,
      kind: 'facebook_linked',
      email: user.facebook_email ?? user.email,
      providerSubject: user.facebook_user_id,
    });
  }
  if (user.apple_sub) {
    await recordIdentityEvent(db, {
      userId: user.id,
      kind: 'apple_linked',
      email: user.apple_email ?? user.email,
      providerSubject: user.apple_sub,
    });
  }
}

export interface AdminIdentityHistoryItem {
  kind: IdentityEventKind;
  createdAt: string;
  email: string | null;
  previousEmail: string | null;
  providerSubject: string | null;
  backfilled: boolean;
}

/** Paginated identity timeline for the browser-admin user card. */
export async function listAdminIdentityHistoryPage(
  pool: pg.Pool,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ events: AdminIdentityHistoryItem[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query<EncryptedIdentityEventRow>(
      `select *
         from user_identity_events
        where user_id = $1
        order by created_at desc, id desc
        limit $2 offset $3`,
      [userId, pageSize, offset],
    ),
    pool.query<{ total: string }>(
      `select count(*)::text as total from user_identity_events where user_id = $1`,
      [userId],
    ),
  ]);
  return {
    events: rows.map((row) => {
      const event = decryptEventRow(row);
      return {
        kind: event.kind,
        createdAt: event.createdAt,
        email: event.email,
        previousEmail: event.previousEmail,
        providerSubject: event.providerSubject,
        backfilled: event.backfilled,
      };
    }),
    total: Number(countRows[0]?.total ?? 0),
  };
}

interface SeedUserRow {
  id: string;
  email: string;
  email_lookup: string;
  created_at: string;
  google_sub: string | null;
  google_email: string | null;
  google_email_lookup: string | null;
  facebook_user_id: string | null;
  facebook_email: string | null;
  facebook_email_lookup: string | null;
  apple_sub: string | null;
  apple_email: string | null;
  apple_email_lookup: string | null;
}

/**
 * Idempotent seed for accounts that predate `user_identity_events`.
 * One `account_created` per user (dated `users.created_at`) and one linked
 * event per currently attached provider (dated now). Skips users that already
 * have any history row.
 */
export async function backfillUserIdentityEvents(pool: pg.Pool, batchSize = 200): Promise<number> {
  let inserted = 0;
  for (;;) {
    const { rows } = await pool.query<SeedUserRow>(
      `select u.id, u.email, u.email_lookup, u.created_at,
              u.google_sub, u.google_email, u.google_email_lookup,
              u.facebook_user_id, u.facebook_email, u.facebook_email_lookup,
              u.apple_sub, u.apple_email, u.apple_email_lookup
         from users u
        where not exists (
          select 1 from user_identity_events e where e.user_id = u.id
        )
        order by u.created_at, u.id
        limit $1`,
      [batchSize],
    );
    if (rows.length === 0) return inserted;

    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const row of rows) {
        await client.query(
          `insert into user_identity_events (
             id, user_id, kind, email, email_lookup,
             previous_email, previous_email_lookup, provider_subject, backfilled, created_at
           ) values ($1, $2, 'account_created', $3, $4, null, null, null, true, $5)`,
          [randomUUID(), row.id, row.email, row.email_lookup, row.created_at],
        );
        inserted += 1;

        if (row.google_sub) {
          await client.query(
            `insert into user_identity_events (
               id, user_id, kind, email, email_lookup,
               previous_email, previous_email_lookup, provider_subject, backfilled, created_at
             ) values ($1, $2, 'google_linked', $3, $4, null, null, $5, true, now())`,
            [
              randomUUID(),
              row.id,
              row.google_email ?? row.email,
              row.google_email_lookup ?? row.email_lookup,
              row.google_sub,
            ],
          );
          inserted += 1;
        }
        if (row.facebook_user_id) {
          await client.query(
            `insert into user_identity_events (
               id, user_id, kind, email, email_lookup,
               previous_email, previous_email_lookup, provider_subject, backfilled, created_at
             ) values ($1, $2, 'facebook_linked', $3, $4, null, null, $5, true, now())`,
            [
              randomUUID(),
              row.id,
              row.facebook_email ?? row.email,
              row.facebook_email_lookup ?? row.email_lookup,
              row.facebook_user_id,
            ],
          );
          inserted += 1;
        }
        if (row.apple_sub) {
          await client.query(
            `insert into user_identity_events (
               id, user_id, kind, email, email_lookup,
               previous_email, previous_email_lookup, provider_subject, backfilled, created_at
             ) values ($1, $2, 'apple_linked', $3, $4, null, null, $5, true, now())`,
            [
              randomUUID(),
              row.id,
              row.apple_email ?? row.email,
              row.apple_email_lookup ?? row.email_lookup,
              row.apple_sub,
            ],
          );
          inserted += 1;
        }
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    if (rows.length < batchSize) return inserted;
  }
}

