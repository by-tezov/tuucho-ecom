import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  shopConfig: { adminRouteToken: '' },
}));

vi.mock('@/plugins/PluginHost', () => ({
  pluginHasFrontConfigure: (id: string) => id === 'tuucho-contact',
}));

import type { AdminPlugin } from '@/api/admin/shopSetup';
import { pluginConfigurePath, pluginHasConfigure } from '@/routes/pluginConfigure';

function plugin(partial: Partial<AdminPlugin> & { id: string; kind?: string }): AdminPlugin {
  return {
    id: partial.id,
    enabled: true,
    settings: partial.settings ?? {},
    rates: partial.rates ?? [],
    manifest: {
      name: partial.id,
      kind: partial.kind ?? 'page',
      description: '',
      ...(partial.manifest ?? {}),
    },
  };
}

describe('pluginHasConfigure', () => {
  it('hides Configure when there is no plugin settings form', () => {
    expect(pluginHasConfigure(plugin({ id: 'tuucho-page-home', kind: 'page' }))).toBe(false);
    expect(pluginHasConfigure(plugin({ id: 'tuucho-page-about', kind: 'page' }))).toBe(false);
    expect(pluginConfigurePath(plugin({ id: 'tuucho-page-home', kind: 'page' }))).toBeNull();
    expect(pluginHasConfigure(plugin({ id: 'tuucho-journal-api', kind: 'generic' }))).toBe(false);
    expect(pluginHasConfigure(plugin({ id: 'demo-page-guides', kind: 'page' }))).toBe(false);
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
      expect(pluginHasConfigure(plugin({ id, kind })), id).toBe(false);
      expect(pluginConfigurePath(plugin({ id, kind })), id).toBeNull();
    }
  });

  it('keeps Configure only for this plugin settings form', () => {
    expect(pluginHasConfigure(plugin({ id: 'tuucho-contact', kind: 'generic' }))).toBe(true);
    expect(pluginConfigurePath(plugin({ id: 'tuucho-contact', kind: 'generic' }))).toBe(
      '/admin/plugins/tuucho-contact',
    );
    expect(pluginHasConfigure(plugin({ id: 'tuucho-theme-default', kind: 'theme' }))).toBe(true);
    expect(pluginConfigurePath(plugin({ id: 'tuucho-theme-default', kind: 'theme' }))).toBe(
      '/admin/plugins/tuucho-theme-default',
    );
    expect(pluginHasConfigure(plugin({ id: 'tuucho-shipping-home', kind: 'shipping' }))).toBe(false);
    expect(pluginHasConfigure(plugin({ id: 'tuucho-shipping-mondial-relay', kind: 'shipping' }))).toBe(
      false,
    );
    expect(pluginConfigurePath(plugin({ id: 'tuucho-shipping-home', kind: 'shipping' }))).toBeNull();
    expect(pluginHasConfigure(plugin({ id: 'tuucho-payment-stripe', kind: 'payment' }))).toBe(false);
    expect(pluginConfigurePath(plugin({ id: 'tuucho-payment-stripe', kind: 'payment' }))).toBeNull();
    expect(
      pluginHasConfigure(
        plugin({
          id: 'shop-notes',
          kind: 'page',
          manifest: {
            name: 'Shop notes',
            kind: 'page',
            description: '',
            settingsSchema: { title: { type: 'string', label: 'Title' } },
          },
        }),
      ),
    ).toBe(true);
    expect(
      pluginConfigurePath(
        plugin({
          id: 'shop-notes',
          kind: 'page',
          manifest: {
            name: 'Shop notes',
            kind: 'page',
            description: '',
            settingsSchema: { title: { type: 'string', label: 'Title' } },
          },
        }),
      ),
    ).toBe('/admin/plugins/shop-notes');
  });
});
