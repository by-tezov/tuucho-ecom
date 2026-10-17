import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { GDPR_CONSENT_VERSION } from '../../../config/gdpr.js';
import { generateOpaqueToken, hashOpaqueToken as hashToken } from '../../../platform/security/opaqueToken.js';
import { isLanguage, type Language } from '../../../utils/language.js';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';
import {
  hasUnclaimedGuestSavedCheckout,
  refreshGuestSavedCheckoutExpiry,
} from '../../customers/application/guestSavedCheckout.js';

function guestOrderManageUrl(rawToken: string): string {
  return `${config.frontendBaseUrl}/account/manage-order?token=${rawToken}`;
}

export function orderCheckoutLanguage(language: string | null | undefined): Language {
  return language && isLanguage(language) ? language : 'en';
}

/** Issues a fresh 24h token for an unlinked guest order. Older unused tokens
 * for the same order stay valid until their own expiry — a later status
 * email extends the window without killing the confirmation link. */
async function issueGuestOrderManageUrl(
  pool: pg.Pool,
  orderId: string,
  email: string,
  language: Language,
): Promise<string> {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + config.emailConfirmation.tokenTtlMs).toISOString();
  await pool.query(
    `insert into guest_order_manage_tokens
       (id, order_id, email, email_lookup, token_hash, gdpr_consent_version, language, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      orderId,
      encryptPii(email),
      emailLookupHash(email),
      hashToken(rawToken),
      GDPR_CONSENT_VERSION,
      language,
      expiresAt,
    ],
  );
  return guestOrderManageUrl(rawToken);
}

/** Issue a Manage-my-order link when the order is still unlinked, or when
 * remembered guest address/card rows are waiting on this email. Refreshes
 * pending saved-checkout expiry to match the new token window. */
export async function maybeIssueGuestOrderManageUrl(
  pool: pg.Pool,
  order: { id: string; user_id: string | null; guest_email: string | null },
  email: string,
  language: Language,
): Promise<string | undefined> {
  const unlinked = !order.user_id && !!order.guest_email;
  const pendingSaved = await hasUnclaimedGuestSavedCheckout(pool, email);
  if (!unlinked && !pendingSaved) return undefined;
  const url = await issueGuestOrderManageUrl(pool, order.id, email, language);
  if (pendingSaved) await refreshGuestSavedCheckoutExpiry(pool, email);
  return url;
}

export type ConsumeGuestOrderManageResult =
  | {
      status: 'fresh';
      orderId: string;
      email: string;
      gdprConsentVersion: string;
      language: Language;
    }
  | { status: 'invalid' };

interface TokenRow {
  order_id: string;
  email: string;
  gdpr_consent_version: string;
  language: string;
}

function toFreshResult(row: TokenRow): Extract<ConsumeGuestOrderManageResult, { status: 'fresh' }> {
  return {
    status: 'fresh',
    orderId: row.order_id,
    email: decryptPii(row.email)!,
    gdprConsentVersion: row.gdpr_consent_version,
    language: orderCheckoutLanguage(row.language),
  };
}

/** Consumes a still-valid token. A re-click (or email-client prefetch + the
 * real click) of an already-used token still returns `fresh` while it is
 * inside the 24h window so the customer can be signed in and sent to
 * /orders. Expired tokens are `invalid`. */
export async function consumeGuestOrderManageToken(
  client: pg.PoolClient,
  rawToken: string,
): Promise<ConsumeGuestOrderManageResult> {
  const hash = hashToken(rawToken);
  const { rows } = await client.query<TokenRow>(
    `update guest_order_manage_tokens set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning order_id, email, gdpr_consent_version, language`,
    [hash],
  );
  if (rows[0]) return toFreshResult(rows[0]);

  const { rows: existingRows } = await client.query<TokenRow>(
    `select order_id, email, gdpr_consent_version, language
     from guest_order_manage_tokens
     where token_hash = $1 and expires_at > now()`,
    [hash],
  );
  if (existingRows[0]) return toFreshResult(existingRows[0]);
  return { status: 'invalid' };
}

export async function markGuestOrderManageTokensUsed(
  client: pg.PoolClient,
  orderIds: string[],
): Promise<void> {
  if (orderIds.length === 0) return;
  await client.query(
    `update guest_order_manage_tokens
        set used_at = coalesce(used_at, now())
      where order_id = any($1::uuid[])
        and used_at is null`,
    [orderIds],
  );
}
