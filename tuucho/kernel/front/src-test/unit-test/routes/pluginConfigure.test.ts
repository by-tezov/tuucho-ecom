import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  shopConfig: { adminRouteToken: '' },
}));

vi.mock('@/plugins/PluginHost', () => ({
  pluginHasFrontConfigure: (id: string) => id === 'tuucho-contact',
}));

import type { AdminPlugin } from '@/api/admin/shopSetup';
import { pluginConfigurePath, pluginHasConfigure } from '@/routes/pluginConfigure';

function plugin(
  partial: Partial<AdminPlugin> & { id: string; kinds?: string[]; kind?: string },
): AdminPlugin {
  const kinds = partial.kinds ?? (partial.kind ? [partial.kind] : ['page']);
  return {
    id: partial.id,
    enabled: true,
    settings: partial.settings ?? {},
    rates: partial.rates ?? [],
    manifest: {
      name: partial.id,
      kinds,
      description: '',
      ...(partial.manifest ?? {}),
    },
  };
}

describe('pluginHasConfigure', () => {
  it('hides Configure when there is no plugin settings form', () => {
    expect(pluginHasConfigure(plugin({ id: 'page-home', kinds: ['page'] }))).toBe(false);
    expect(pluginHasConfigure(plugin({ id: 'page-about', kinds: ['page'] }))).toBe(false);
    expect(pluginConfigurePath(plugin({ id: 'page-home', kinds: ['page'] }))).toBeNull();
    expect(pluginHasConfigure(plugin({ id: 'tuucho-journal-api', kinds: ['generic'] }))).toBe(false);
    expect(pluginHasConfigure(plugin({ id: 'page-guides', kinds: ['page'] }))).toBe(false);
  });

  it('does not reuse Configure for host or plugin admin screens', () => {
    const hacks = [
      ['tuucho-docs-developer', 'docs'],
      ['tuucho-commerce-vouchers', 'commerce'],
      ['tuucho-commerce-cart-rules', 'commerce'],
      ['tuucho-commerce-vinted-review', 'commerce'],
      ['tuucho-commerce-product-requests', 'commerce'],
      ['tuucho-commerce-loyalty', 'commerce'],
      ['tuucho-commerce-gift', 'commerce'],
      ['tuucho-mail-spy', 'generic'],
      ['tuucho-journal-admin', 'generic'],
      ['tuucho-journal-email', 'generic'],
      ['tuucho-journal-cron', 'generic'],
      ['tuucho-seo-redirects', 'seo'],
      ['tuucho-seo-robots', 'seo'],
      ['tuucho-seo-sitemap', 'seo'],
    ] as const;
    for (const [id, kind] of hacks) {
      expect(pluginHasConfigure(plugin({ id, kinds: [kind] })), id).toBe(false);
      expect(pluginConfigurePath(plugin({ id, kinds: [kind] })), id).toBeNull();
    }
  });

  it('keeps Configure only for this plugin settings form', () => {
    expect(pluginHasConfigure(plugin({ id: 'tuucho-contact', kinds: ['generic'] }))).toBe(true);
    expect(pluginConfigurePath(plugin({ id: 'tuucho-contact', kinds: ['generic'] }))).toBe(
      '/admin/plugins/tuucho-contact',
    );
    expect(pluginHasConfigure(plugin({ id: 'tuucho-theme-default', kinds: ['theme'] }))).toBe(true);
    expect(pluginConfigurePath(plugin({ id: 'tuucho-theme-default', kinds: ['theme'] }))).toBe(
      '/admin/plugins/tuucho-theme-default',
    );
    expect(pluginHasConfigure(plugin({ id: 'tuucho-shipping-home', kinds: ['shipping'] }))).toBe(false);
    expect(pluginHasConfigure(plugin({ id: 'tuucho-shipping-mondial-relay', kinds: ['shipping'] }))).toBe(
      false,
    );
    expect(pluginConfigurePath(plugin({ id: 'tuucho-shipping-home', kinds: ['shipping'] }))).toBeNull();
    expect(pluginHasConfigure(plugin({ id: 'tuucho-payment-stripe', kinds: ['payment'] }))).toBe(false);
    expect(pluginConfigurePath(plugin({ id: 'tuucho-payment-stripe', kinds: ['payment'] }))).toBeNull();
    expect(
      pluginHasConfigure(
        plugin({
          id: 'shop-notes',
          kinds: ['page'],
          manifest: {
            name: 'Shop notes',
            kinds: ['page'],
            description: '',
            settingsSchema: {
              title: { type: 'string', label: 'Title', description: 'Shown on the page.' },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(
      pluginConfigurePath(
        plugin({
          id: 'shop-notes',
          kinds: ['page'],
          manifest: {
            name: 'Shop notes',
            kinds: ['page'],
            description: '',
            settingsSchema: {
              title: { type: 'string', label: 'Title', description: 'Shown on the page.' },
            },
          },
        }),
      ),
    ).toBe('/admin/plugins/shop-notes');
    expect(
      pluginHasConfigure(
        plugin({
          id: 'tuucho-commerce-gift',
          kinds: ['commerce'],
          manifest: {
            name: 'Gift',
            kinds: ['commerce'],
            description: '',
            settingsSchema: {
              minBudget: { type: 'number', label: 'Minimum budget', description: 'Lowest gift budget.' },
            },
          },
        }),
      ),
    ).toBe(true);
  });
});
