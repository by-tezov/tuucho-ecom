import crypto from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import {
  clearFacebookUserId,
  findUserByFacebookUserId,
  requestDeletion,
} from '../../identity/application/users.js';
import { revokeAllUserRefreshTokens } from '../../../platform/security/token.js';
import {
  accountDeletionRequestedSpyEmail,
  deletionRequestedEmail,
  sendMail,
  spyRecipient,
} from '../../messaging/application/email.js';
import { isFacebookSignInConfigured } from '../../identity/application/facebookAuth.js';
import { getUserLanguage } from '../../identity/application/userPreferences.js';

export type FacebookDataDeletionStatus =
  'received' | 'facebook_unlinked' | 'account_deletion_scheduled' | 'no_matching_account';

export interface FacebookDataDeletionRequestRow {
  confirmation_code: string;
  facebook_user_id: string;
  user_id: string | null;
  status: FacebookDataDeletionStatus;
  deletion_scheduled_for: string | null;
  created_at: string;
}

interface SignedRequestPayload {
  algorithm?: string;
  user_id?: string;
}

function base64UrlToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

/** Verifies Meta's `signed_request` (HMAC-SHA256) and returns the Facebook user id. */
function parseFacebookSignedRequest(signedRequest: string): string | undefined {
  const secret = config.facebook.appSecret;
  if (!secret || !signedRequest.includes('.')) return undefined;
  const [encodedSig, encodedPayload] = signedRequest.split('.', 2);
  if (!encodedSig || !encodedPayload) return undefined;

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(base64UrlToBuffer(encodedPayload).toString('utf8')) as SignedRequestPayload;
  } catch {
    return undefined;
  }

  if ((payload.algorithm ?? '').toUpperCase() !== 'HMAC-SHA256') return undefined;
  const userId = payload.user_id?.trim();
  if (!userId) return undefined;

  const expected = crypto.createHmac('sha256', secret).update(encodedPayload).digest();
  const actual = base64UrlToBuffer(encodedSig);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return undefined;
  }
  return userId;
}

function newConfirmationCode(): string {
  return crypto.randomBytes(12).toString('hex');
}

function statusUrl(confirmationCode: string): string {
  const base = config.frontendBaseUrl.replace(/\/$/, '');
  return `${base}/auth/facebook-data-deletion?code=${encodeURIComponent(confirmationCode)}`;
}

export interface FacebookDataDeletionCallbackResult {
  url: string;
  confirmation_code: string;
}

/** How far back a retry of the same callback is treated as the same request
 * rather than a new one. Meta re-sends a callback it did not get a clean 200
 * for; without this every retry unlinked an already-unlinked account, ran
 * requestDeletion again, and minted a second confirmation code — so the code
 * Meta finally recorded was not the one the customer's earlier email pointed
 * at. Bounded rather than "ever", so a genuine second deletion request after
 * the customer re-links Facebook is still honoured. */
const RETRY_WINDOW_MINUTES = 60;

/** Handles Meta's data-deletion callback: unlink Facebook data, schedule
 * account deletion when a matching Lumen user exists.
 *
 * Every write below happens in one transaction. They used to be independent
 * statements on the pool, so a failure anywhere past the first left the
 * account unlinked (and possibly already scheduled for deletion) with no
 * audit row recorded and no confirmation code returned — on the one endpoint
 * whose whole job is to be auditable. Mail is sent after the commit, never
 * inside it: an SMTP stall must not hold a transaction open, and a delivery
 * failure must not roll back a deletion Meta has already been told about. */
export async function handleFacebookDataDeletionRequest(
  signedRequest: string,
): Promise<FacebookDataDeletionCallbackResult | undefined> {
  if (!isFacebookSignInConfigured()) return undefined;
  const facebookUserId = parseFacebookSignedRequest(signedRequest);
  if (!facebookUserId) return undefined;

  // Answer a retry with the code it was already given (see RETRY_WINDOW_MINUTES).
  const { rows: recentRows } = await pool.query<{ confirmation_code: string }>(
    `select confirmation_code from facebook_data_deletion_requests
     where facebook_user_id = $1 and created_at > now() - make_interval(mins => $2)
     order by created_at desc
     limit 1`,
    [facebookUserId, RETRY_WINDOW_MINUTES],
  );
  const recent = recentRows[0];
  if (recent) {
    return { url: statusUrl(recent.confirmation_code), confirmation_code: recent.confirmation_code };
  }

  const confirmationCode = newConfirmationCode();
  const id = crypto.randomUUID();

  /** Filled inside the transaction, sent after it commits. */
  let pendingMail: { email: string; deletionScheduledFor: string; userId: string } | undefined;

  const client = await pool.connect();
  try {
    await client.query('begin');

    const user = await findUserByFacebookUserId(client, facebookUserId);

    let status: FacebookDataDeletionStatus = 'no_matching_account';
    let deletionScheduledFor: string | null = null;
    let userId: string | null = null;

    if (user && user.status !== 'deleted') {
      userId = user.id;
      await clearFacebookUserId(client, user.id);
      await client.query(
        `update facebook_signup_tokens set used_at = now()
         where facebook_user_id = $1 and used_at is null`,
        [facebookUserId],
      );
      await client.query(
        `update facebook_link_tokens set used_at = now()
         where facebook_user_id = $1 and used_at is null`,
        [facebookUserId],
      );

      if (user.status === 'active') {
        const scheduled = await requestDeletion(client, user.id);
        deletionScheduledFor = scheduled.deletionScheduledFor;
        await revokeAllUserRefreshTokens(client, user.id);
        status = 'account_deletion_scheduled';
        pendingMail = {
          email: user.email,
          deletionScheduledFor: scheduled.deletionScheduledFor,
          userId: user.id,
        };
      } else {
        status = 'facebook_unlinked';
      }
    }

    await client.query(
      `insert into facebook_data_deletion_requests
         (id, confirmation_code, facebook_user_id, user_id, status, deletion_scheduled_for)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, confirmationCode, facebookUserId, userId, status, deletionScheduledFor],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (pendingMail) {
    try {
      await sendMail({
        to: pendingMail.email,
        ...deletionRequestedEmail(
          pendingMail.deletionScheduledFor.slice(0, 10),
          await getUserLanguage(pool, pendingMail.userId),
        ),
      });
    } catch (error) {
      console.error('[facebook-data-deletion] customer email failed', error);
    }
    const spyTo = spyRecipient('account_deletion');
    if (spyTo) {
      try {
        await sendMail({
          to: spyTo,
          ...accountDeletionRequestedSpyEmail({
            email: pendingMail.email,
            userId: pendingMail.userId,
            deletionScheduledFor: pendingMail.deletionScheduledFor,
          }),
        });
      } catch (error) {
        console.error('[facebook-data-deletion] spy email failed', error);
      }
    }
  }

  return { url: statusUrl(confirmationCode), confirmation_code: confirmationCode };
}

export async function findFacebookDataDeletionByCode(
  db: pg.Pool,
  confirmationCode: string,
): Promise<FacebookDataDeletionRequestRow | undefined> {
  const code = confirmationCode.trim();
  if (!code || code.length > 64) return undefined;
  const { rows } = await db.query<FacebookDataDeletionRequestRow>(
    `select confirmation_code, facebook_user_id, user_id, status, deletion_scheduled_for, created_at
     from facebook_data_deletion_requests
     where confirmation_code = $1`,
    [code],
  );
  return rows[0];
}
