import { config } from '../config/env.js';
import { createRateLimiter } from '../platform/http/createRateLimiter.js';

/** Per-IP throttle on POST /auth/login — a second, independent layer from
 * the per-account lockout in loginAttempts.service.ts (that one stops a
 * single targeted account from being hammered; this one stops one IP from
 * hammering many accounts). Counts failures only. */
export const loginRateLimiter = createRateLimiter({
  windowMs: config.login.lockoutDurationMs,
  limit: config.login.maxFailedAttempts,
  failuresOnly: true,
  disabled: () => config.rateLimits.disableLogin,
  kind: 'rate_limit_login',
});

/** Covers register / request-otp / verify-otp / request-password-reset /
 * confirm-password-reset / resend-email-confirmation — counts every request,
 * not just failures, since even a "successful" register/reset-request spam
 * (e.g. scripted signups, or hammering a stranger's inbox with reset or
 * OTP emails) is exactly what this should stop. */
export const authRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.authWindowMs,
  limit: config.rateLimits.authMax,
  disabled: () => config.rateLimits.disableAuth,
  kind: 'rate_limit_auth',
});

/** Contact messages can be sent without an account, so they need their own
 * conservative per-IP limit. It also covers logged-in messages. */
export const contactRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.contactEmailWindowMs,
  limit: config.rateLimits.contactEmailMax,
  disabled: () => config.rateLimits.disableContactEmail,
  kind: 'rate_limit_contact_email',
});

/** Creating a gift offer has its own budget. It used to borrow the contact
 * limiter, which shared one bucket: sending a contact message spent a
 * customer's gift attempts and the reverse. Same abuse shape, different
 * action, different normal volume. */
export const giftCreateRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.giftCreateEmailWindowMs,
  limit: config.rateLimits.giftCreateEmailMax,
  disabled: () => config.rateLimits.disableGiftCreateEmail,
  kind: 'rate_limit_gift_create_email',
});

/** Giver's "Ma carte cadeau" modal — edit, download, and (re)email each get
 * their own budget rather than sharing giftCreateRateLimiter's or falling
 * back to the generic authRateLimiter. Recipient for the email action is
 * always the giver's own account email (never free-text), so this is about
 * render/send cost, not third-party-inbox abuse. */
export const giftShareCardUpdateRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.giftShareCardUpdateWindowMs,
  limit: config.rateLimits.giftShareCardUpdateMax,
  disabled: () => config.rateLimits.disableGiftShareCardUpdate,
  kind: 'rate_limit_gift_share_card_update',
});

export const giftShareCardDownloadRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.giftShareCardDownloadWindowMs,
  limit: config.rateLimits.giftShareCardDownloadMax,
  disabled: () => config.rateLimits.disableGiftShareCardDownload,
  kind: 'rate_limit_gift_share_card_download',
});

export const giftShareCardEmailRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.giftShareCardEmailWindowMs,
  limit: config.rateLimits.giftShareCardEmailMax,
  disabled: () => config.rateLimits.disableGiftShareCardEmail,
  kind: 'rate_limit_gift_share_card_email',
});

/** "Ma Facture" modal's two actions — per-IP window+max, own budget each
 * (see accountOrderManagement.router.ts). */
export const invoiceDownloadRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.invoiceDownloadWindowMs,
  limit: config.rateLimits.invoiceDownloadMax,
  disabled: () => config.rateLimits.disableInvoiceDownload,
  kind: 'rate_limit_invoice_download',
});

export const invoiceEmailRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.invoiceEmailWindowMs,
  limit: config.rateLimits.invoiceEmailMax,
  disabled: () => config.rateLimits.disableInvoiceEmail,
  kind: 'rate_limit_invoice_email',
});

export const authRefreshRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.authRefreshWindowMs,
  limit: config.rateLimits.authRefreshMax,
  disabled: () => config.rateLimits.disableAuthRefresh,
  kind: 'rate_limit_refresh',
});

export const voucherRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.voucherWindowMs,
  limit: config.rateLimits.voucherMax,
  disabled: () => config.rateLimits.disableVoucher,
  kind: 'rate_limit_voucher',
});

export const checkoutRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.checkoutWindowMs,
  limit: config.rateLimits.checkoutMax,
  disabled: () => config.rateLimits.disableCheckout,
  kind: 'rate_limit_checkout',
});

export const paymentRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.paymentWindowMs,
  limit: config.rateLimits.paymentMax,
  disabled: () => config.rateLimits.disablePayment,
  kind: 'rate_limit_payment',
});

export const galleryRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.galleryWindowMs,
  limit: config.rateLimits.galleryMax,
  disabled: () => config.rateLimits.disableGallery,
  kind: 'rate_limit_gallery',
});

/** Per-IP throttle on gift PIN unlock (giver and receiver). Counts every
 * attempt; pairs with the per-offer DB lock/throttle in giftPin.ts. */
export const giftPinRateLimiter = createRateLimiter({
  windowMs: config.rateLimits.giftPinWindowMs,
  limit: config.rateLimits.giftPinMax,
  disabled: () => config.rateLimits.disableGiftPin,
  kind: 'rate_limit_gift_pin',
});
