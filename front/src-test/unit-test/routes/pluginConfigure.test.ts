import { describe, expect, it } from 'vitest';
import type { AdminPlugin } from '../../../src/api/admin/shopSetup';
import { pluginConfigurePath, pluginHasConfigure } from '../../../src/routes/pluginConfigure';

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
  it('hides Configure when a page plugin has no schema and no settings', () => {
    expect(pluginHasConfigure(plugin({ id: 'page-home', kind: 'page' }))).toBe(false);
    expect(pluginHasConfigure(plugin({ id: 'page-about', kind: 'page' }))).toBe(false);
    expect(pluginConfigurePath(plugin({ id: 'page-home', kind: 'page' }))).toBeNull();
  });

  it('keeps Configure for theme, shipping, Stripe, schema pages and deep links', () => {
    expect(pluginHasConfigure(plugin({ id: 'theme-default', kind: 'theme' }))).toBe(true);
    expect(pluginHasConfigure(plugin({ id: 'shipping-home', kind: 'shipping' }))).toBe(true);
    expect(pluginHasConfigure(plugin({ id: 'payment-stripe', kind: 'payment' }))).toBe(true);
    expect(pluginHasConfigure(plugin({ id: 'docs-developer', kind: 'docs' }))).toBe(true);
    expect(pluginHasConfigure(plugin({ id: 'commerce-vouchers', kind: 'commerce' }))).toBe(true);
    expect(pluginHasConfigure(plugin({ id: 'commerce-gift', kind: 'commerce' }))).toBe(true);
    expect(pluginHasConfigure(plugin({ id: 'commerce-loyalty', kind: 'commerce' }))).toBe(true);
    expect(pluginHasConfigure(plugin({ id: 'commerce-product-requests', kind: 'commerce' }))).toBe(true);
    expect(pluginHasConfigure(plugin({ id: 'journal-api', kind: 'generic' }))).toBe(false);
    expect(
      pluginHasConfigure(
        plugin({
          id: 'page-studio-note',
          kind: 'page',
          manifest: {
            name: 'Studio note',
            kind: 'page',
            description: '',
            settingsSchema: { title: { type: 'string', label: 'Title' } },
          },
        }),
      ),
    ).toBe(true);
  });
});
