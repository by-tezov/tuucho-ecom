import type { AdminPlugin } from '../api/admin/shopSetup';
import { adminPath } from '../utils/adminRoute';

const DEEP_LINKS: Record<string, string> = {
  'docs-developer': '/docs',
  'commerce-vouchers': '/vouchers',
  'commerce-cart-rules': '/cart-rules',
  'commerce-reviews': '/reviews',
  'commerce-product-requests': '/product-requests',
  'commerce-loyalty': '/loyalty',
  'commerce-gift': '/gift',
  'journal-admin': '/api-log',
  'journal-email': '/email-log',
  'journal-cron': '/crons',
};

/** True when Configure would open a real form or admin CRUD page, not a blank
 * settings screen. Theme, shipping, Stripe, and deep-linked commerce/docs
 * pages count even without a settingsSchema. Page plugins need fields. */
export function pluginHasConfigure(plugin: AdminPlugin): boolean {
  if (plugin.id in DEEP_LINKS) return true;
  if (plugin.manifest.kind === 'theme') return true;
  if (plugin.manifest.kind === 'shipping') return true;
  if (plugin.id === 'payment-stripe') return true;
  const schema = plugin.manifest.settingsSchema ?? {};
  const settings = plugin.settings ?? {};
  return Object.keys(schema).length > 0 || Object.keys(settings).length > 0;
}

export function pluginConfigurePath(plugin: AdminPlugin): string | null {
  if (!pluginHasConfigure(plugin)) return null;
  const deep = DEEP_LINKS[plugin.id];
  return deep ? adminPath(deep) : adminPath(`/plugins/${plugin.id}`);
}
