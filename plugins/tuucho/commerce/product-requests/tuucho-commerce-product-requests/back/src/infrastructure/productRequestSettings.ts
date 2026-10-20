import {
  pluginSettingNumber,
  pluginSettingOptionalString,
} from '@kernel/back/modules/plugins/application/pluginSettingValues';
import { pluginOwnedRateLimiter } from '@kernel/back/middleware/pluginRateLimiter';

const PLUGIN = 'tuucho-commerce-product-requests';

export const productRequestRateLimiter = pluginOwnedRateLimiter({
  pluginId: PLUGIN,
  rateKey: 'rate',
  fallback: '15m:5',
  disableKey: 'disableRate',
  kind: 'rate_limit_contact_email',
});

export function productRequestCommentMax(): number {
  return pluginSettingNumber(PLUGIN, 'commentMax', 500);
}

export function productRequestReplyTo(): string | undefined {
  return pluginSettingOptionalString(PLUGIN, 'recipient') ?? pluginSettingOptionalString(PLUGIN, 'smtpUser');
}
