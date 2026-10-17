/** Spy notification kinds that can be toggled independently. */
export const SPY_KINDS = [
  'account_created',
  'login',
  'email_changed',
  'account_deletion',
  'order_confirmation',
  'order_cancelled',
  'order_updated',
  'payment_failed',
  'payment_authorization_expired',
  'payment_authorization_expiring',
  'cart_abandoned',
  'product_request',
  'gift_created',
  'website_down',
  'website_restore_failed',
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
] as const;

export type SpyKind = (typeof SPY_KINDS)[number];

export function isSpyKind(value: string): value is SpyKind {
  return (SPY_KINDS as readonly string[]).includes(value);
}
