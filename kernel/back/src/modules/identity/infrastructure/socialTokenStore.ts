import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { generateOpaqueToken, hashOpaqueToken } from '../../../platform/security/opaqueToken.js';
import type { Language } from '../../../utils/language.js';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';

export type SocialSignupTokenDefinition =
  | { table: 'google_signup_tokens'; subjectColumn: 'google_sub'; ttlMs: number }
  | { table: 'facebook_signup_tokens'; subjectColumn: 'facebook_user_id'; ttlMs: number }
  | { table: 'apple_signup_tokens'; subjectColumn: 'apple_sub'; ttlMs: number };

export async function issueSocialSignupToken(
  pool: pg.Pool,
  definition: SocialSignupTokenDefinition,
  input: { providerSubject: string; email: string; language: Language },
): Promise<string> {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + definition.ttlMs).toISOString();

  await pool.query(
    `update ${definition.table} set used_at = now()
     where ${definition.subjectColumn} = $1 and used_at is null`,
    [input.providerSubject],
  );
  await pool.query(
    `insert into ${definition.table}
       (id, token_hash, ${definition.subjectColumn}, email, email_lookup, language, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      hashOpaqueToken(rawToken),
      input.providerSubject,
      encryptPii(input.email),
      emailLookupHash(input.email),
      input.language,
      expiresAt,
    ],
  );
  return rawToken;
}

export async function consumeSocialSignupToken(
  pool: pg.Pool,
  definition: SocialSignupTokenDefinition,
  rawToken: string,
): Promise<{ providerSubject: string; email: string; language: Language } | undefined> {
  const { rows } = await pool.query<{ provider_subject: string; email: string; language: string }>(
    `update ${definition.table} set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning ${definition.subjectColumn} as provider_subject, email, language`,
    [hashOpaqueToken(rawToken)],
  );
  const row = rows[0];
  if (!row) return undefined;
  const email = decryptPii(row.email);
  if (!email) return undefined;
  return { providerSubject: row.provider_subject, email, language: row.language as Language };
}

export type SocialLinkTokenDefinition =
  | {
      table: 'google_link_tokens';
      subjectColumn: 'google_sub';
      emailColumn: 'google_email';
      emailLookupColumn: 'google_email_lookup';
      ttlMs: number;
    }
  | {
      table: 'facebook_link_tokens';
      subjectColumn: 'facebook_user_id';
      emailColumn: 'facebook_email';
      emailLookupColumn: 'facebook_email_lookup';
      ttlMs: number;
    }
  | {
      table: 'apple_link_tokens';
      subjectColumn: 'apple_sub';
      emailColumn: 'apple_email';
      emailLookupColumn: 'apple_email_lookup';
      ttlMs: number;
    };

export async function issueSocialLinkToken(
  pool: pg.Pool,
  definition: SocialLinkTokenDefinition,
  input: { userId: string; providerSubject: string; providerEmail: string },
): Promise<string> {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + definition.ttlMs).toISOString();
  const email = input.providerEmail.trim().toLowerCase();

  await pool.query(
    `update ${definition.table} set used_at = now()
     where user_id = $1 and used_at is null`,
    [input.userId],
  );
  await pool.query(
    `insert into ${definition.table}
       (id, token_hash, user_id, ${definition.subjectColumn}, ${definition.emailColumn}, ${definition.emailLookupColumn}, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      hashOpaqueToken(rawToken),
      input.userId,
      input.providerSubject,
      encryptPii(email),
      emailLookupHash(email),
      expiresAt,
    ],
  );
  return rawToken;
}

export async function consumeSocialLinkToken(
  pool: pg.Pool,
  definition: SocialLinkTokenDefinition,
  rawToken: string,
  userId: string,
): Promise<{ userId: string; providerSubject: string; providerEmail: string } | undefined> {
  const { rows } = await pool.query<{
    user_id: string;
    provider_subject: string;
    provider_email: string;
  }>(
    `update ${definition.table} set used_at = now()
     where token_hash = $1
       and user_id = $2
       and used_at is null
       and expires_at > now()
     returning user_id,
       ${definition.subjectColumn} as provider_subject,
       ${definition.emailColumn} as provider_email`,
    [hashOpaqueToken(rawToken), userId],
  );
  const row = rows[0];
  if (!row) return undefined;
  const email = decryptPii(row.provider_email);
  if (!email) return undefined;
  return { userId: row.user_id, providerSubject: row.provider_subject, providerEmail: email };
}
