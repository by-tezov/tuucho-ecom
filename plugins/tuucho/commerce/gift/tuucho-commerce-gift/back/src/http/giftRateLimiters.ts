import { pluginOwnedRateLimiter } from '@kernel/back/middleware/pluginRateLimiter';

const PLUGIN = 'tuucho-commerce-gift';

export const giftCreateRateLimiter = pluginOwnedRateLimiter({
  pluginId: PLUGIN,
  rateKey: 'rateGiftCreateEmail',
  fallback: '15m:10',
  disableKey: 'disableRateGiftCreateEmail',
  kind: 'rate_limit_gift_create_email',
});

export const giftShareCardUpdateRateLimiter = pluginOwnedRateLimiter({
  pluginId: PLUGIN,
  rateKey: 'rateGiftShareCardUpdate',
  fallback: '15m:5',
  disableKey: 'disableRateGiftShareCardUpdate',
  kind: 'rate_limit_gift_share_card_update',
});

export const giftShareCardDownloadRateLimiter = pluginOwnedRateLimiter({
  pluginId: PLUGIN,
  rateKey: 'rateGiftShareCardDownload',
  fallback: '15m:5',
  disableKey: 'disableRateGiftShareCardDownload',
  kind: 'rate_limit_gift_share_card_download',
});

export const giftShareCardEmailRateLimiter = pluginOwnedRateLimiter({
  pluginId: PLUGIN,
  rateKey: 'rateGiftShareCardEmail',
  fallback: '15m:5',
  disableKey: 'disableRateGiftShareCardEmail',
  kind: 'rate_limit_gift_share_card_email',
});

export const giftPinRateLimiter = pluginOwnedRateLimiter({
  pluginId: PLUGIN,
  rateKey: 'rateGiftPin',
  fallback: '60s:20',
  disableKey: 'disableRateGiftPin',
  kind: 'rate_limit_gift_pin',
});
