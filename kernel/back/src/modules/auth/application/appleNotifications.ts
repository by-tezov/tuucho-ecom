import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { signInProviderSetting } from '../../identity/application/signInProviderSettings.js';
import { pool } from '../../../db/pool.js';
import { isAppleSignInConfigured, verifyAppleJws } from '../../identity/application/appleAuth.js';
import { clearAppleSub, findUserByAppleSub } from '../../identity/application/users.js';

type AppleS2sEvent = {
  type?: unknown;
  sub?: unknown;
  event_time?: unknown;
  email?: unknown;
  is_private_email?: unknown;
};

function audiencesForS2s(): string[] {
  const list = [signInProviderSetting('apple', 'clientId'), signInProviderSetting('apple', 's2sAudience')].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  return [...new Set(list.map((value) => value.trim()))];
}

function parseEventsClaim(raw: unknown): AppleS2sEvent | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as AppleS2sEvent;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as AppleS2sEvent;
  }
  return undefined;
}

function isUnlinkEvent(type: string): boolean {
  return type === 'consent-revoked' || type === 'account-deleted' || type === 'account-delete';
}

async function burnPendingAppleTokens(db: pg.Pool | pg.PoolClient, appleSub: string): Promise<void> {
  await db.query(
    `update apple_signup_tokens set used_at = now()
     where apple_sub = $1 and used_at is null`,
    [appleSub],
  );
  await db.query(
    `update apple_link_tokens set used_at = now()
     where apple_sub = $1 and used_at is null`,
    [appleSub],
  );
  await db.query(
    `update social_auth_pending set used_at = now()
     where provider = 'apple' and provider_subject = $1 and used_at is null`,
    [appleSub],
  );
}

/**
 * Handles Apple Sign in with Apple server-to-server notifications.
 * Body shape: `{ "payload": "<JWS>" }`. Returns false when the JWT is invalid
 * so the route can respond 400; true when Apple should treat delivery as OK.
 */
export async function handleAppleS2sNotification(payloadJws: string): Promise<boolean> {
  if (!isAppleSignInConfigured()) {
    throw new Error('apple_sign_in_disabled');
  }
  const audiences = audiencesForS2s();
  if (audiences.length === 0) return false;

  let claims;
  try {
    claims = await verifyAppleJws(payloadJws, audiences);
  } catch {
    return false;
  }

  const jti = typeof claims.jti === 'string' ? claims.jti.trim() : '';
  if (!jti) return false;

  const events = parseEventsClaim(claims.events);
  const eventType = typeof events?.type === 'string' && events.type.trim() ? events.type.trim() : 'unknown';
  const appleSub =
    typeof events?.sub === 'string' && events.sub.trim()
      ? events.sub.trim()
      : typeof claims.sub === 'string' && claims.sub.trim()
        ? claims.sub.trim()
        : '';
  if (!appleSub) return false;

  // Idempotency: first insert wins. A duplicate jti is already processed.
  const { rows: inserted } = await pool.query<{ id: string }>(
    `insert into apple_s2s_notifications (id, jti, event_type, apple_sub, user_id)
     values ($1, $2, $3, $4, null)
     on conflict (jti) do nothing
     returning id`,
    [randomUUID(), jti, eventType, appleSub],
  );
  if (inserted.length === 0) {
    return true;
  }
  const notificationId = inserted[0]!.id;

  if (!isUnlinkEvent(eventType)) {
    if (eventType !== 'email-enabled' && eventType !== 'email-disabled') {
      console.info('[apple-s2s] unhandled event type', eventType, appleSub);
    }
    return true;
  }

  const user = await findUserByAppleSub(pool, appleSub);
  if (user && user.status !== 'deleted') {
    await clearAppleSub(pool, user.id);
    await burnPendingAppleTokens(pool, appleSub);
    await pool.query(`update apple_s2s_notifications set user_id = $1 where id = $2`, [
      user.id,
      notificationId,
    ]);
  } else {
    await burnPendingAppleTokens(pool, appleSub);
  }

  return true;
}
