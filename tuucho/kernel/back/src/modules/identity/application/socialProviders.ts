/**
 * One descriptor per social sign-in provider, and the generic flows over them.
 *
 * Google, Apple and Facebook each had their own `<provider>Link.ts` and
 * `<provider>Signup.ts`: six files that were byte-identical apart from a table
 * name, a column name and a config key, plus the renaming of
 * `providerSubject`/`providerEmail` to `googleSub`/`appleEmail` and so on.
 * That renaming was the only thing they added, and it cost a fourth provider
 * two new files before any real work started.
 *
 * The descriptors below are the entire difference between providers. Adding
 * one means adding a row here and its config, not a new module.
 */
import type pg from 'pg';
import type { Language } from '../../../utils/language.js';
import { signInProviderSignupTtlMs } from './signInProviderSettings.js';
import {
  consumeSocialLinkToken,
  consumeSocialSignupToken,
  issueSocialLinkToken,
  issueSocialSignupToken,
  type SocialLinkTokenDefinition,
  type SocialSignupTokenDefinition,
} from './socialTokens.js';

const SOCIAL_PROVIDERS = ['google', 'apple', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];


/** The per-provider storage shape. Column names differ because each provider's
 * columns were added by its own migration; the tokens themselves behave
 * identically. TTL is read from the provider plugin at issue time. */
function linkTokenDef(provider: SocialProvider): SocialLinkTokenDefinition {
  const ttlMs = signInProviderSignupTtlMs(provider);
  switch (provider) {
    case 'google':
      return {
        table: 'google_link_tokens',
        subjectColumn: 'google_sub',
        emailColumn: 'google_email',
        emailLookupColumn: 'google_email_lookup',
        ttlMs,
      };
    case 'apple':
      return {
        table: 'apple_link_tokens',
        subjectColumn: 'apple_sub',
        emailColumn: 'apple_email',
        emailLookupColumn: 'apple_email_lookup',
        ttlMs,
      };
    case 'facebook':
      return {
        table: 'facebook_link_tokens',
        subjectColumn: 'facebook_user_id',
        emailColumn: 'facebook_email',
        emailLookupColumn: 'facebook_email_lookup',
        ttlMs,
      };
  }
}

function signupTokenDef(provider: SocialProvider): SocialSignupTokenDefinition {
  const ttlMs = signInProviderSignupTtlMs(provider);
  switch (provider) {
    case 'google':
      return { table: 'google_signup_tokens', subjectColumn: 'google_sub', ttlMs };
    case 'apple':
      return { table: 'apple_signup_tokens', subjectColumn: 'apple_sub', ttlMs };
    case 'facebook':
      return { table: 'facebook_signup_tokens', subjectColumn: 'facebook_user_id', ttlMs };
  }
}

export interface ConsumedLinkToken {
  userId: string;
  providerSubject: string;
  providerEmail: string;
}

export interface ConsumedSignupToken {
  providerSubject: string;
  email: string;
  language: Language;
}

/** Holds a verified provider identity until the customer picks keep vs switch. */
export async function issueLinkToken(
  pool: pg.Pool,
  provider: SocialProvider,
  input: { userId: string; providerSubject: string; providerEmail: string },
): Promise<{ rawToken: string }> {
  const rawToken = await issueSocialLinkToken(pool, linkTokenDef(provider), input);
  return { rawToken };
}

export async function consumeLinkToken(
  pool: pg.Pool,
  provider: SocialProvider,
  rawToken: string,
  userId: string,
): Promise<ConsumedLinkToken | undefined> {
  const token = await consumeSocialLinkToken(pool, linkTokenDef(provider), rawToken, userId);
  return token
    ? { userId: token.userId, providerSubject: token.providerSubject, providerEmail: token.providerEmail }
    : undefined;
}

/** Holds a verified provider identity until CGU consent. No users row yet. */
export async function issueSignupToken(
  pool: pg.Pool,
  provider: SocialProvider,
  input: { providerSubject: string; email: string; language: Language },
): Promise<{ rawToken: string }> {
  const rawToken = await issueSocialSignupToken(pool, signupTokenDef(provider), input);
  return { rawToken };
}

export async function consumeSignupToken(
  pool: pg.Pool,
  provider: SocialProvider,
  rawToken: string,
): Promise<ConsumedSignupToken | undefined> {
  const token = await consumeSocialSignupToken(pool, signupTokenDef(provider), rawToken);
  return token
    ? { providerSubject: token.providerSubject, email: token.email, language: token.language }
    : undefined;
}
