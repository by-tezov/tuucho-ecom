import type { Request } from 'express';
import type { SpyKind } from '../../modules/settings/application/appPreferences.js';
import { pluginSettingBool, pluginSettingDurationMs, pluginSettingNumber } from '../../modules/plugins/application/pluginSettingValues.js';
import { rateLimitedSpyEmail, sendMail, spyTo } from '../../modules/messaging/application/email.js';

/** Spy kinds that fire when a rate limit / send cap / login lockout trips. */
const RATE_LIMIT_SPY_KINDS = [
  'rate_limit_login',
  'rate_limit_auth',
  'rate_limit_contact_email',
  'rate_limit_refresh',
  'rate_limit_voucher',
  'rate_limit_checkout',
  'rate_limit_payment',
  'rate_limit_gallery',
  'rate_limit_ops',
  'rate_limit_gift_pin',
  'rate_limit_gift_create_email',
  'rate_limit_gift_share_card_update',
  'rate_limit_gift_share_card_download',
  'rate_limit_gift_share_card_email',
  'rate_limit_otp_email',
  'rate_limit_email_confirmation',
  'rate_limit_email_change',
  'rate_limit_invoice_download',
  'rate_limit_invoice_email',
  'rate_limit_password_reset_email',
  'rate_limit_login_lockout',
] as const satisfies readonly SpyKind[];

export type RateLimitSpyKind = (typeof RATE_LIMIT_SPY_KINDS)[number];

const KIND_LABELS: Record<RateLimitSpyKind, string> = {
  rate_limit_login: 'login (IP)',
  rate_limit_auth: 'auth (IP)',
  rate_limit_contact_email: 'contact (IP)',
  rate_limit_refresh: 'refresh (IP)',
  rate_limit_voucher: 'voucher (IP)',
  rate_limit_checkout: 'checkout (IP)',
  rate_limit_payment: 'payment (IP)',
  rate_limit_gallery: 'gallery (IP)',
  rate_limit_ops: 'ops (IP)',
  rate_limit_gift_pin: 'gift PIN (IP)',
  rate_limit_gift_create_email: 'création cadeau (IP)',
  rate_limit_gift_share_card_update: 'modification carte cadeau (IP)',
  rate_limit_gift_share_card_download: 'téléchargement carte cadeau (IP)',
  rate_limit_gift_share_card_email: 'envoi carte cadeau (IP)',
  rate_limit_otp_email: 'OTP (compte)',
  rate_limit_email_confirmation: 'confirmation e-mail (compte)',
  rate_limit_email_change: 'changement e-mail (compte)',
  rate_limit_invoice_download: 'téléchargement facture (compte)',
  rate_limit_invoice_email: 'envoi facture (compte)',
  rate_limit_password_reset_email: 'réinitialisation mot de passe (compte)',
  rate_limit_login_lockout: 'verrouillage connexion (compte)',
};

type CooldownEntry = {
  /** When the last spy email for this key was sent. */
  lastSentAt: number;
  /** Hits suppressed since lastSentAt (not including the mailed one). */
  suppressed: number;
};

/** In-process cooldown map — same trade-off as express-rate-limit's memory
 * store. Keyed by kind + IP (or user id when IP is missing / send-cap). */
const cooldown = new Map<string, CooldownEntry>();

export type RateLimitSpyHit = {
  kind: RateLimitSpyKind;
  method?: string | null;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  reason?: 'day' | 'month' | string | null;
  retryAfterSec?: number | null;
};

/** The map used to keep one entry per kind and IP for the life of the
 * process. An entry past its cooldown with nothing suppressed carries no
 * information (a missing entry behaves the same), so it is dropped; past a
 * hard ceiling the oldest go first whatever they hold. */
const COOLDOWN_MAX_ENTRIES = 10_000;

function pruneCooldown(now: number): void {
  if (cooldown.size <= COOLDOWN_MAX_ENTRIES / 2) return;
  for (const [key, entry] of cooldown) {
    if (entry.suppressed === 0 && now - entry.lastSentAt >= pluginSettingDurationMs('tuucho-mail-spy', 'cooldown', '15m')) {
      cooldown.delete(key);
    }
  }
  for (const key of cooldown.keys()) {
    if (cooldown.size <= COOLDOWN_MAX_ENTRIES) break;
    cooldown.delete(key);
  }
}

function cooldownKey(hit: RateLimitSpyHit): string {
  const subject = hit.userId ?? hit.ip ?? 'unknown';
  return `${hit.kind}:${subject}`;
}

function takeCooldown(hit: RateLimitSpyHit): { send: boolean; suppressed: number } {
  const key = cooldownKey(hit);
  const now = Date.now();
  const existing = cooldown.get(key);
  if (
    pluginSettingBool('tuucho-mail-spy', 'disableCooldown') ||
    !existing ||
    now - existing.lastSentAt >= pluginSettingDurationMs('tuucho-mail-spy', 'cooldown', '15m')
  ) {
    const suppressed = existing?.suppressed ?? 0;
    cooldown.delete(key);
    cooldown.set(key, { lastSentAt: now, suppressed: 0 });
    pruneCooldown(now);
    return { send: true, suppressed };
  }
  existing.suppressed += 1;
  return { send: false, suppressed: existing.suppressed };
}

/** Fire-and-forget owner spy when a limiter / send cap / lockout trips.
 * Never throws into the request path; never delays the 429/423/200. */
export function notifyRateLimited(hit: RateLimitSpyHit): void {
  const label = KIND_LABELS[hit.kind];
  void spyTo(hit.kind)
    .then((to) => {
      if (!to) return;
      const { send, suppressed } = takeCooldown(hit);
      if (!send) return;
      return sendMail({
        to,
        ...rateLimitedSpyEmail({
          kindLabel: label,
          method: hit.method ?? null,
          path: hit.path ?? null,
          ip: hit.ip ?? null,
          userAgent: hit.userAgent ?? null,
          userId: hit.userId ?? null,
          userEmail: hit.userEmail ?? null,
          reason: hit.reason ?? null,
          retryAfterSec: hit.retryAfterSec ?? null,
          suppressedCount: suppressed,
        }),
      });
    })
    .catch((error) => {
      console.error('[rate-limit-spy] notification failed', error);
    });
}

/**
 * Daily send-volume alert for the per-account mail caps that are now only a
 * cooldown gap (auth OTP, email confirmation, email change).
 *
 * The cooldown stops a burst, and its own spy fires when a caller trips it.
 * What neither covers is a caller that paces itself just outside the gap:
 * it trips nothing and, at a one-minute cooldown, still puts well over a
 * thousand mails a day on one address. The day/month caps this replaced
 * would at least have surfaced that. So the volume is watched here instead
 * of capped — the owner gets the mail and blocks the IP or the account, and
 * a real customer who legitimately asks for many codes is never locked out
 * by a threshold nobody is watching.
 *
 * Callers pass the count they already have from their own send log; this
 * module stays free of SQL and of any table name.
 */
export function notifySendVolume(
  hit: Omit<RateLimitSpyHit, 'reason'> & { sentToday: number },
): void {
  if (hit.sentToday < pluginSettingNumber('tuucho-mail-spy', 'sendVolumeDay', 30)) return;
  notifyRateLimited({ ...hit, reason: `volume_24h:${hit.sentToday}` });
}

/** Convenience for Express handlers — pulls method/path/IP/UA/user from req. */
export function notifyRateLimitedFromRequest(
  req: Request,
  kind: RateLimitSpyKind,
  extra?: Partial<Omit<RateLimitSpyHit, 'kind'>>,
): void {
  const rateLimitInfo = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
  const retryAfterSec = rateLimitInfo?.resetTime
    ? Math.max(0, Math.ceil((rateLimitInfo.resetTime.getTime() - Date.now()) / 1000))
    : undefined;
  notifyRateLimited({
    kind,
    method: req.method,
    path: req.originalUrl?.split('?')[0] ?? req.path,
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
    userId: req.user?.id ?? null,
    userEmail: req.user?.email ?? null,
    retryAfterSec,
    ...extra,
  });
}
