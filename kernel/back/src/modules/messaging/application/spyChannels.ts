import {
  applyFilters,
  CORE_OPENING_FILTERS,
  type SpyChannelDeclaration,
  type SpyResolveState,
} from '@tuucho/plugin-sdk';
import { pluginSettingBool } from '../../plugins/application/pluginSettingValues.js';
import { SPY_KINDS, type SpyKind } from '../../settings/domain/spyKinds.js';
import {
  isOutageSpyChannel,
  OUTAGE_SPY_CHANNEL_IDS,
  readCachedOutageSpyTo,
  rememberOutageSpyTo,
} from './outageSpyCache.js';

export { OUTAGE_SPY_CHANNEL_IDS };

const PLUGIN_OWNED_SPY_KINDS = new Set<SpyKind>(['gift_created', 'product_request']);

const KERNEL_SPY_COPY: Record<
  Exclude<SpyKind, 'gift_created' | 'product_request'>,
  { title: string; description: string }
> = {
  account_created: {
    title: 'Account created',
    description: 'Staff copy when a shop account is created (sign-up or gift giver).',
  },
  login: {
    title: 'Sign-in',
    description: 'Staff copy when someone signs in.',
  },
  email_changed: {
    title: 'Email changed',
    description: 'Staff copy when an account email is changed.',
  },
  account_deletion: {
    title: 'Account deletion',
    description: 'Staff copy when an account deletion is requested or completed.',
  },
  order_confirmation: {
    title: 'Order confirmation',
    description: 'Staff copy of a new paid order.',
  },
  order_cancelled: {
    title: 'Order cancelled',
    description: 'Staff copy when an order is cancelled.',
  },
  order_updated: {
    title: 'Order updated',
    description: 'Staff copy when an order is updated.',
  },
  payment_failed: {
    title: 'Payment failed',
    description: 'Staff copy when a payment fails.',
  },
  payment_authorization_expired: {
    title: 'Payment authorization expired',
    description: 'Staff copy when a pre-capture authorization expires.',
  },
  payment_authorization_expiring: {
    title: 'Payment authorization expiring',
    description: 'Staff copy when a pre-capture authorization is about to expire.',
  },
  cart_abandoned: {
    title: 'Cart abandoned',
    description: 'Staff copy when the last item leaves a cart.',
  },
  website_down: {
    title: 'Website down',
    description: 'Staff copy when /healthz fails (warm cron). Last resolved To is cached for the outage script if DB is down.',
  },
  website_restore_failed: {
    title: 'Website restore failed',
    description: 'Staff copy when Passenger restore does not bring /healthz back.',
  },
  rate_limit_login: {
    title: 'Rate limit: login',
    description: 'Staff copy when the login limiter trips.',
  },
  rate_limit_auth: {
    title: 'Rate limit: auth',
    description: 'Staff copy when an auth limiter trips.',
  },
  rate_limit_contact_email: {
    title: 'Rate limit: contact email',
    description: 'Staff copy when the contact-email limiter trips.',
  },
  rate_limit_refresh: {
    title: 'Rate limit: refresh',
    description: 'Staff copy when the session-refresh limiter trips.',
  },
  rate_limit_voucher: {
    title: 'Rate limit: voucher',
    description: 'Staff copy when the voucher limiter trips.',
  },
  rate_limit_checkout: {
    title: 'Rate limit: checkout',
    description: 'Staff copy when the checkout limiter trips.',
  },
  rate_limit_payment: {
    title: 'Rate limit: payment',
    description: 'Staff copy when the payment limiter trips.',
  },
  rate_limit_gallery: {
    title: 'Rate limit: gallery',
    description: 'Staff copy when the gallery limiter trips.',
  },
  rate_limit_ops: {
    title: 'Rate limit: operations',
    description: 'Staff copy when an operations limiter trips.',
  },
  rate_limit_gift_pin: {
    title: 'Rate limit: gift PIN',
    description: 'Staff copy when the gift PIN limiter trips.',
  },
  rate_limit_gift_create_email: {
    title: 'Rate limit: gift create email',
    description: 'Staff copy when the gift-create email limiter trips.',
  },
  rate_limit_gift_share_card_update: {
    title: 'Rate limit: gift share-card update',
    description: 'Staff copy when the gift share-card update limiter trips.',
  },
  rate_limit_gift_share_card_download: {
    title: 'Rate limit: gift share-card download',
    description: 'Staff copy when the gift share-card download limiter trips.',
  },
  rate_limit_gift_share_card_email: {
    title: 'Rate limit: gift share-card email',
    description: 'Staff copy when the gift share-card email limiter trips.',
  },
  rate_limit_otp_email: {
    title: 'Rate limit: OTP email',
    description: 'Staff copy when the OTP email limiter trips.',
  },
  rate_limit_email_confirmation: {
    title: 'Rate limit: email confirmation',
    description: 'Staff copy when the email-confirmation limiter trips.',
  },
  rate_limit_email_change: {
    title: 'Rate limit: email change',
    description: 'Staff copy when the email-change limiter trips.',
  },
  rate_limit_invoice_download: {
    title: 'Rate limit: invoice download',
    description: 'Staff copy when the invoice-download limiter trips.',
  },
  rate_limit_invoice_email: {
    title: 'Rate limit: invoice email',
    description: 'Staff copy when the invoice-email limiter trips.',
  },
  rate_limit_password_reset_email: {
    title: 'Rate limit: password reset',
    description: 'Staff copy when the password-reset email limiter trips.',
  },
  rate_limit_login_lockout: {
    title: 'Rate limit: login lockout',
    description: 'Staff copy when a login lockout trips.',
  },
};

const SPY_FILTERS: SpyChannelDeclaration['filters'] = ['role', 'email', 'kind'];

/** Kernel-originated spy channels. Gift and product-request register themselves. */
export const KERNEL_SPY_CHANNELS: SpyChannelDeclaration[] = SPY_KINDS.filter(
  (kind): kind is Exclude<SpyKind, 'gift_created' | 'product_request'> => !PLUGIN_OWNED_SPY_KINDS.has(kind),
).map((id) => ({
  id,
  pluginId: 'kernel',
  ...KERNEL_SPY_COPY[id],
  filters: SPY_FILTERS,
}));

function withKernelSpyChannels(listed: SpyChannelDeclaration[]): SpyChannelDeclaration[] {
  const kernelIds = new Set(KERNEL_SPY_CHANNELS.map((channel) => channel.id));
  const extras = listed.filter((channel) => !kernelIds.has(channel.id));
  return [...KERNEL_SPY_CHANNELS, ...extras];
}

export async function listSpyChannels(): Promise<SpyChannelDeclaration[]> {
  const listed = await applyFilters<SpyChannelDeclaration[]>(
    CORE_OPENING_FILTERS.mailSpyChannels,
    KERNEL_SPY_CHANNELS,
  );
  return withKernelSpyChannels(listed ?? []);
}

export function uniqueSpyEmails(emails: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Who receives this channel. Empty when the spy plugin is off or nobody matches. */
export async function resolveSpyRecipients(channelId: string): Promise<string[]> {
  if (pluginSettingBool('tuucho-mail-spy', 'disableEmail')) {
    await rememberOutageSpyTo(channelId, []);
    return [];
  }
  const channels = await listSpyChannels();
  if (!channels.some((channel) => channel.id === channelId)) return [];
  const resolved = await applyFilters<SpyResolveState>(CORE_OPENING_FILTERS.mailSpyResolve, {
    channelId,
    to: [],
  });
  const to = uniqueSpyEmails(resolved.to ?? []);
  await rememberOutageSpyTo(channelId, to);
  return to;
}

/** Comma-joined To for `sendMail`, or undefined to skip. */
export async function spyTo(channelId: string): Promise<string | undefined> {
  const to = await resolveSpyRecipients(channelId);
  return to.length ? to.join(', ') : undefined;
}

/** Refresh the on-disk To for website_down / website_restore_failed while DB is up. */
export async function snapshotOutageSpyCache(): Promise<void> {
  for (const id of OUTAGE_SPY_CHANNEL_IDS) {
    await resolveSpyRecipients(id);
  }
}

/**
 * Live `spyTo` when plugins/DB load; otherwise last cached To for outage channels.
 * Empty live resolve wins (do not fall back to a stale cache or env mailbox).
 */
export async function liveOrCachedOutageSpyTo(channelId: string): Promise<string | undefined> {
  if (!isOutageSpyChannel(channelId)) return undefined;
  try {
    const { ensurePluginsLoaded } = await import('../../plugins/application/loadPluginRuntime.js');
    await ensurePluginsLoaded();
    const to = await resolveSpyRecipients(channelId);
    for (const id of OUTAGE_SPY_CHANNEL_IDS) {
      if (id !== channelId) await resolveSpyRecipients(id);
    }
    return to.length ? to.join(', ') : undefined;
  } catch (error) {
    console.error('[warm-outage-spy] live spy resolve failed; using last cached To', error);
    return readCachedOutageSpyTo(channelId);
  }
}
