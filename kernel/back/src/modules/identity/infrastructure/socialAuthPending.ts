import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { signInProviderSignupTtlMs } from '../application/signInProviderSettings.js';
import { generateOpaqueToken, hashOpaqueToken as hashToken } from '../../../platform/security/opaqueToken.js';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';
import type { Language } from '../../../utils/language.js';

export type SocialAuthProvider = 'google' | 'apple' | 'facebook';

export interface IssuedSocialAuthPending {
  rawToken: string;
}

export interface SocialAuthPending {
  provider: SocialAuthProvider;
  providerSubject: string;
  /** Provider email when known (may be Apple Hide My Email relay). */
  email: string | null;
  language: Language;
}

/** Holds a verified social identity until the shopper chooses create vs link. */
export async function issueSocialAuthPending(
  pool: pg.Pool,
  input: {
    provider: SocialAuthProvider;
    providerSubject: string;
    email: string | null;
    language: Language;
  },
): Promise<IssuedSocialAuthPending> {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + signInProviderSignupTtlMs(input.provider)).toISOString();
  const email = input.email?.trim().toLowerCase() || null;
  const lookup = email ? emailLookupHash(email) : null;

  await pool.query(
    `update social_auth_pending set used_at = now()
     where provider = $1 and provider_subject = $2 and used_at is null`,
    [input.provider, input.providerSubject],
  );

  await pool.query(
    `insert into social_auth_pending
       (id, token_hash, provider, provider_subject, email, email_lookup, language, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      hashToken(rawToken),
      input.provider,
      input.providerSubject,
      email ? encryptPii(email) : null,
      lookup,
      input.language,
      expiresAt,
    ],
  );

  return { rawToken };
}

async function rowToPending(row: {
  provider: string;
  provider_subject: string;
  email: string | null;
  language: string;
}): Promise<SocialAuthPending | undefined> {
  const email = row.email ? decryptPii(row.email) : null;
  if (row.email && !email) return undefined;
  if (row.provider !== 'google' && row.provider !== 'apple' && row.provider !== 'facebook') {
    return undefined;
  }
  return {
    provider: row.provider,
    providerSubject: row.provider_subject,
    email,
    language: row.language as Language,
  };
}

/** Read without consuming — used for link OTP request. */
export async function peekSocialAuthPending(
  pool: pg.Pool,
  rawToken: string,
): Promise<SocialAuthPending | undefined> {
  const { rows } = await pool.query<{
    provider: string;
    provider_subject: string;
    email: string | null;
    language: string;
  }>(
    `select provider, provider_subject, email, language
     from social_auth_pending
     where token_hash = $1 and used_at is null and expires_at > now()`,
    [hashToken(rawToken)],
  );
  const row = rows[0];
  if (!row) return undefined;
  return rowToPending(row);
}

export async function consumeSocialAuthPending(
  pool: pg.Pool,
  rawToken: string,
): Promise<SocialAuthPending | undefined> {
  const { rows } = await pool.query<{
    provider: string;
    provider_subject: string;
    email: string | null;
    language: string;
  }>(
    `update social_auth_pending set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning provider, provider_subject, email, language`,
    [hashToken(rawToken)],
  );
  const row = rows[0];
  if (!row) return undefined;
  return rowToPending(row);
}
