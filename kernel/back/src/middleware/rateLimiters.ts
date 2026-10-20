import { config } from '../config/env.js';
import { createRateLimiter } from '../platform/http/createRateLimiter.js';
import { pluginOwnedRateLimiter } from './pluginRateLimiter.js';

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

export const voucherRateLimiter = pluginOwnedRateLimiter({
  pluginId: 'tuucho-commerce-vouchers',
  rateKey: 'rateVoucher',
  fallback: '60s:10',
  disableKey: 'disableRateVoucher',
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
