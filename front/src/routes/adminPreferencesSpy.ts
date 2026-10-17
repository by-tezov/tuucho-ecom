import type { AdminSpyKind } from '../api/admin/commerce';
import type { AdminUiStrings } from '../assets/i18n/admin';

/** Split out of AdminPreferencesPage.tsx, which is at its own size ratchet:
 * pure data with nowhere left to grow in that file. */
/** `title` is a key of the admin dictionary's `spy` section. */
export const SPY_GROUPS: {
  id: string;
  title: 'groupAccount' | 'groupOrders' | 'groupOther' | 'groupIpLimits' | 'groupAccountLimits';
  kinds: AdminSpyKind[];
}[] = [
  {
    id: 'compte',
    title: 'groupAccount',
    kinds: ['account_created', 'login', 'email_changed', 'account_deletion'],
  },
  {
    id: 'commandes',
    title: 'groupOrders',
    kinds: [
      'order_confirmation',
      'order_cancelled',
      'order_updated',
      'payment_failed',
      'payment_authorization_expired',
      'payment_authorization_expiring',
    ],
  },
  {
    id: 'autres',
    title: 'groupOther',
    kinds: ['cart_abandoned', 'product_request', 'gift_created', 'website_down', 'website_restore_failed'],
  },
  {
    id: 'limites-ip',
    title: 'groupIpLimits',
    kinds: [
      'rate_limit_login',
      'rate_limit_auth',
      'rate_limit_contact_email',
      'rate_limit_refresh',
      'rate_limit_voucher',
      'rate_limit_checkout',
      'rate_limit_payment',
      'rate_limit_gallery',
      'rate_limit_ops',
    ],
  },
  {
    id: 'limites-compte',
    title: 'groupAccountLimits',
    kinds: [
      'rate_limit_otp_email',
      'rate_limit_email_confirmation',
      'rate_limit_email_change',
      'rate_limit_invoice_download',
      'rate_limit_invoice_email',
      'rate_limit_password_reset_email',
      'rate_limit_login_lockout',
    ],
  },
];

/** Each spy kind's label, in the current admin language. */
export function spyLabel(a: AdminUiStrings, kind: AdminSpyKind): string {
  return a.spy[kind];
}
