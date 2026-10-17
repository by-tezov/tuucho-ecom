import type pg from 'pg';
import { getUserPreference, setUserPreference } from './userPreferences.js';
import { findUserById } from './users.js';

/** Master + transactional + marketing notification prefs (user_preference).
 * Missing key = enabled. Forced mails (password reset, confirm, lock,
 * deletion) ignore these — see shouldSendNotification. */

const NOTIFY_MASTER = 'emails_enabled' as const;

const TRANSACTIONAL_CHANNELS = [
  'order_confirmation',
  'order_shipped',
  'invoice',
  'security',
  'chat_reply',
  'loyalty_expiry',
] as const;

const MARKETING_CHANNELS = [
  'nouveautes',
  'cart_reminder',
  'favorite_sold',
  'favorite_restock',
  'promo',
] as const;

export type TransactionalChannel = (typeof TRANSACTIONAL_CHANNELS)[number];
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];
export type NotificationChannel = typeof NOTIFY_MASTER | TransactionalChannel | MarketingChannel;

const PREF_PREFIX = 'notify.';

function prefKey(channel: NotificationChannel): string {
  return `${PREF_PREFIX}${channel}`;
}

export function isNotificationChannel(value: string): value is NotificationChannel {
  if (value === NOTIFY_MASTER) return true;
  return (
    (TRANSACTIONAL_CHANNELS as readonly string[]).includes(value) ||
    (MARKETING_CHANNELS as readonly string[]).includes(value)
  );
}

async function isPrefEnabled(pool: pg.Pool, userId: string, channel: NotificationChannel): Promise<boolean> {
  const raw = await getUserPreference(pool, userId, prefKey(channel));
  if (raw === null) return true;
  return raw === 'true';
}

export interface NotificationPreferencesView {
  emailsEnabled: boolean;
  primary: { email: string; verified: boolean };
  transactional: Record<TransactionalChannel, boolean>;
  marketing: Record<MarketingChannel, boolean>;
}

export async function getNotificationPreferences(
  pool: pg.Pool,
  userId: string,
): Promise<NotificationPreferencesView | null> {
  // The user and every channel in two parallel reads (it was twelve
  // single-key queries in a row). Missing key = enabled, as isPrefEnabled.
  const channels: NotificationChannel[] = [NOTIFY_MASTER, ...TRANSACTIONAL_CHANNELS, ...MARKETING_CHANNELS];
  const [user, { rows: prefRows }] = await Promise.all([
    findUserById(pool, userId),
    pool.query<{ key: string; value: string }>(
      `select key, value from user_preference where user_id = $1 and key = any($2::text[])`,
      [userId, channels.map(prefKey)],
    ),
  ]);
  if (!user) return null;
  const stored = new Map(prefRows.map((row) => [row.key, row.value]));
  const enabled = (channel: NotificationChannel) => {
    const raw = stored.get(prefKey(channel));
    return raw === undefined ? true : raw === 'true';
  };

  const emailsEnabled = enabled(NOTIFY_MASTER);
  const transactional = {} as Record<TransactionalChannel, boolean>;
  for (const channel of TRANSACTIONAL_CHANNELS) transactional[channel] = enabled(channel);
  const marketing = {} as Record<MarketingChannel, boolean>;
  for (const channel of MARKETING_CHANNELS) marketing[channel] = enabled(channel);

  return {
    emailsEnabled,
    primary: {
      email: user.email,
      verified: user.email_verified_at !== null,
    },
    transactional,
    marketing,
  };
}

export async function setNotificationPreference(
  pool: pg.Pool,
  userId: string,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<NotificationPreferencesView | null> {
  await setUserPreference(pool, userId, prefKey(channel), enabled ? 'true' : 'false');
  return getNotificationPreferences(pool, userId);
}

/** Gate for non-forced customer emails. Forced types must not call this.
 * Marketing also requires a verified primary address. */
export async function shouldSendNotification(
  pool: pg.Pool,
  userId: string,
  channel: TransactionalChannel | MarketingChannel,
): Promise<boolean> {
  if (!(await isPrefEnabled(pool, userId, NOTIFY_MASTER))) return false;
  if (!(await isPrefEnabled(pool, userId, channel))) return false;

  if ((MARKETING_CHANNELS as readonly string[]).includes(channel)) {
    const user = await findUserById(pool, userId);
    if (!user || user.email_verified_at === null) return false;
  }

  return true;
}
