import type pg from 'pg';
import { recordIdentityEvent, type IdentityEventKind } from '../application/identityHistory.js';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';

export type SocialIdentityDefinition =
  | {
      provider: 'google';
      subjectColumn: 'google_sub';
      emailColumn: 'google_email';
      emailLookupColumn: 'google_email_lookup';
    }
  | {
      provider: 'facebook';
      subjectColumn: 'facebook_user_id';
      emailColumn: 'facebook_email';
      emailLookupColumn: 'facebook_email_lookup';
    }
  | {
      provider: 'apple';
      subjectColumn: 'apple_sub';
      emailColumn: 'apple_email';
      emailLookupColumn: 'apple_email_lookup';
    };

export const GOOGLE_IDENTITY: SocialIdentityDefinition = {
  provider: 'google',
  subjectColumn: 'google_sub',
  emailColumn: 'google_email',
  emailLookupColumn: 'google_email_lookup',
};
export const FACEBOOK_IDENTITY: SocialIdentityDefinition = {
  provider: 'facebook',
  subjectColumn: 'facebook_user_id',
  emailColumn: 'facebook_email',
  emailLookupColumn: 'facebook_email_lookup',
};
export const APPLE_IDENTITY: SocialIdentityDefinition = {
  provider: 'apple',
  subjectColumn: 'apple_sub',
  emailColumn: 'apple_email',
  emailLookupColumn: 'apple_email_lookup',
};

async function withOwnedTransaction<T>(
  db: pg.Pool | pg.PoolClient,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if ('release' in db) return operation(db);
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

type RowMapper<Row extends pg.QueryResultRow, Result> = (row: Row) => Result;

export async function findUserBySocialSubject<Row extends pg.QueryResultRow, Result>(
  db: pg.Pool | pg.PoolClient,
  definition: SocialIdentityDefinition,
  providerSubject: string,
  mapRow: RowMapper<Row, Result>,
): Promise<Result | undefined> {
  const { rows } = await db.query<Row>(`select * from users where ${definition.subjectColumn} = $1`, [
    providerSubject,
  ]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

/** Idempotent provider-subject backfill used by first social sign-in. */
export async function linkSocialSubjectIfEmpty(
  db: pg.Pool | pg.PoolClient,
  definition: SocialIdentityDefinition,
  userId: string,
  providerSubject: string,
  providerEmail?: string,
): Promise<void> {
  const email = providerEmail?.trim().toLowerCase();
  await withOwnedTransaction(db, async (client) => {
    const { rows } = await client.query<{ provider_subject: string | null }>(
      `select ${definition.subjectColumn} as provider_subject from users where id = $1 for update`,
      [userId],
    );
    const wasEmpty = rows[0]?.provider_subject == null;
    await client.query(
      `update users
       set ${definition.subjectColumn} = coalesce(${definition.subjectColumn}, $2),
           ${definition.emailColumn} = case when $3::text is null then ${definition.emailColumn} else $4 end,
           ${definition.emailLookupColumn} = case when $3::text is null then ${definition.emailLookupColumn} else $5 end,
           updated_at = now()
       where id = $1
         and (${definition.subjectColumn} is null or ${definition.subjectColumn} = $2)`,
      [
        userId,
        providerSubject,
        email ?? null,
        email ? encryptPii(email) : null,
        email ? emailLookupHash(email) : null,
      ],
    );
    if (wasEmpty) {
      await recordIdentityEvent(client, {
        userId,
        kind: `${definition.provider}_linked` as IdentityEventKind,
        email: email ?? null,
        providerSubject,
      });
    }
  });
}

/** Link a provider while preserving the account's main email. */
export async function linkSocialKeepEmail<Row extends pg.QueryResultRow, Result>(
  db: pg.Pool | pg.PoolClient,
  definition: SocialIdentityDefinition,
  userId: string,
  providerSubject: string,
  providerEmail: string,
  mapRow: RowMapper<Row, Result>,
): Promise<Result | undefined> {
  const email = providerEmail.trim().toLowerCase();
  return withOwnedTransaction(db, async (client) => {
    const { rows } = await client.query<Row>(
      `update users
       set ${definition.subjectColumn} = $2,
           ${definition.emailColumn} = $3,
           ${definition.emailLookupColumn} = $4,
           updated_at = now()
       where id = $1
       returning *`,
      [userId, providerSubject, encryptPii(email), emailLookupHash(email)],
    );
    const user = rows[0] ? mapRow(rows[0]) : undefined;
    if (user) {
      await recordIdentityEvent(client, {
        userId,
        kind: `${definition.provider}_linked` as IdentityEventKind,
        email,
        providerSubject,
      });
    }
    return user;
  });
}

/** Promote a verified provider email to the main account email. */
export async function linkSocialSwitchEmail<Row extends pg.QueryResultRow, Result>(
  db: pg.Pool | pg.PoolClient,
  definition: SocialIdentityDefinition,
  userId: string,
  providerSubject: string,
  providerEmail: string,
  mapRow: RowMapper<Row, Result>,
): Promise<Result | undefined> {
  const email = providerEmail.trim().toLowerCase();
  const encrypted = encryptPii(email);
  const lookup = emailLookupHash(email);
  return withOwnedTransaction(db, async (client) => {
    const { rows: beforeRows } = await client.query<{ email: string }>(
      `select email from users where id = $1 for update`,
      [userId],
    );
    const previousEmail = beforeRows[0] ? decryptPii(beforeRows[0].email)! : null;
    const { rows } = await client.query<Row>(
      `update users
       set email = $3,
           email_lookup = $4,
           ${definition.subjectColumn} = $2,
           ${definition.emailColumn} = $3,
           ${definition.emailLookupColumn} = $4,
           email_verified_at = coalesce(email_verified_at, now()),
           pending_email = null,
           pending_email_lookup = null,
           updated_at = now()
       where id = $1
       returning *`,
      [userId, providerSubject, encrypted, lookup],
    );
    const user = rows[0] ? mapRow(rows[0]) : undefined;
    if (user && previousEmail) {
      await recordIdentityEvent(client, {
        userId,
        kind: `${definition.provider}_linked` as IdentityEventKind,
        email,
        providerSubject,
      });
      await recordIdentityEvent(client, {
        userId,
        kind: 'email_changed',
        email,
        previousEmail,
      });
    }
    return user;
  });
}

/** Remove only the provider identity; password and main email are untouched. */
export async function clearSocialIdentity(
  db: pg.Pool | pg.PoolClient,
  definition: SocialIdentityDefinition,
  userId: string,
): Promise<void> {
  await withOwnedTransaction(db, async (client) => {
    const { rows } = await client.query<{ provider_subject: string; provider_email: string | null }>(
      `select ${definition.subjectColumn} as provider_subject,
              ${definition.emailColumn} as provider_email
       from users
       where id = $1 and ${definition.subjectColumn} is not null
       for update`,
      [userId],
    );
    const previous = rows[0];
    if (!previous) return;
    await client.query(
      `update users
       set ${definition.subjectColumn} = null,
           ${definition.emailColumn} = null,
           ${definition.emailLookupColumn} = null,
           updated_at = now()
       where id = $1 and ${definition.subjectColumn} is not null`,
      [userId],
    );
    await recordIdentityEvent(client, {
      userId,
      kind: `${definition.provider}_unlinked` as IdentityEventKind,
      email: decryptPii(previous.provider_email),
      providerSubject: previous.provider_subject,
    });
  });
}
