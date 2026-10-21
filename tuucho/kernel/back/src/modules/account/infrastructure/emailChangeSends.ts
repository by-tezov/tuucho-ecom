import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { notifySendVolume } from '../../../platform/http/rateLimitSpy.js';

/** Log-per-send (email_change_sends), not a counter — same last-sent-at gap
 * shape as emailConfirmation.service.ts's checkResendLimit, applied to
 * POST /account/change-email itself. Deliberately independent from
 * emailConfirmation's own resendCooldownMs even though change-email also
 * records a send into email_confirmation_sends (for its confirmation link)
 * — see config.emailChange's own doc comment for why the two must stay
 * separate. This route is authenticated and already gated by a step-up
 * unlock token, so unlike password reset it's fine to return an explicit
 * 429 rather than silently skipping. */
export async function checkEmailChangeLimit(pool: pg.Pool, userId: string): Promise<boolean> {
  if (config.emailChange.disableCooldown) return false;
  const { rows } = await pool.query<{ sent_at: string }>(
    `select sent_at from email_change_sends where user_id = $1 order by sent_at desc limit 1`,
    [userId],
  );
  const lastSentAt = rows[0]?.sent_at;
  if (!lastSentAt) return false;
  return Date.now() - new Date(lastSentAt).getTime() < config.emailChange.cooldownMs;
}

/** Logs the send and counts the last 24 hours in the same statement, so
 * `notifySendVolume` can surface an account being mailed far past normal
 * use — the cooldown above only catches a burst. */
export async function recordEmailChangeSend(pool: pg.Pool, userId: string): Promise<void> {
  const { rows } = await pool.query<{ sent_today: string }>(
    `with inserted as (
       insert into email_change_sends (id, user_id) values ($1, $2)
     )
     select count(*)::text as sent_today
       from email_change_sends
      where user_id = $2 and sent_at > now() - interval '1 day'`,
    [randomUUID(), userId],
  );
  notifySendVolume({
    kind: 'rate_limit_email_change',
    path: 'email_change_send',
    method: null,
    userId,
    sentToday: Number(rows[0]?.sent_today ?? 0) + 1,
  });
}
