import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFilter, resetHooks } from '../../../../../src/modules/plugins/application/hooks.js';
import { finalizeStorefrontBootstrap } from '../../../../../src/modules/plugins/application/storefrontBootstrap.js';
import type { StoreMenuItem } from '../../../../../src/modules/plugins/application/storeSettings.js';

function menu(pluginId: string, order: number, key = `${pluginId}-menu`): StoreMenuItem {
  return { key, pluginId, label: key, visible: true, order, bottomBar: false };
}

function payload(menus: StoreMenuItem[]) {
  return { installed: true as const, menus };
}

test('finalizeStorefrontBootstrap prunes disabled plugin menus and keeps core-catalog', async () => {
  resetHooks();
  const result = await finalizeStorefrontBootstrap(
    payload([menu('disabled-plugin', 20), menu('core-catalog', 30), menu('enabled-plugin', 10)]),
    new Set(['enabled-plugin']),
  );
  assert.deepEqual(
    result.menus.map((item) => item.pluginId),
    ['enabled-plugin', 'core-catalog'],
  );
});

test('finalizeStorefrontBootstrap filters see all menus before pruning', async () => {
  resetHooks();
  const seen: string[] = [];
  addFilter('storefront.bootstrap', (current: { menus: StoreMenuItem[] }) => {
    seen.push(...current.menus.map((item) => item.pluginId));
    return current;
  });
  await finalizeStorefrontBootstrap(payload([menu('disabled-plugin', 10)]), new Set());
  assert.deepEqual(seen, ['disabled-plugin']);
  resetHooks();
});

test('a filter remapping a disabled plugin menu onto an enabled id keeps it', async () => {
  resetHooks();
  addFilter('storefront.bootstrap', (current: { menus: StoreMenuItem[] }) => ({
    ...current,
    menus: current.menus.map((item) =>
      item.pluginId === 'disabled-plugin' ? { ...item, pluginId: 'enabled-plugin' } : item,
    ),
  }));
  const result = await finalizeStorefrontBootstrap(
    payload([menu('disabled-plugin', 10)]),
    new Set(['enabled-plugin']),
  );
  assert.deepEqual(
    result.menus.map((item) => item.pluginId),
    ['enabled-plugin'],
  );
  resetHooks();
});

test('menus of disabled plugins without a remap still disappear after filters', async () => {
  resetHooks();
  addFilter('storefront.bootstrap', (current: { menus: StoreMenuItem[] }) => current);
  const result = await finalizeStorefrontBootstrap(
    payload([menu('disabled-plugin', 10), menu('other-disabled', 5)]),
    new Set(),
  );
  assert.deepEqual(result.menus, []);
  resetHooks();
});

test('finalizeStorefrontBootstrap re-sorts menus a filter appended', async () => {
  resetHooks();
  addFilter('storefront.bootstrap', (current: { menus: StoreMenuItem[] }) => ({
    ...current,
    menus: [...current.menus, menu('enabled-plugin', 1, 'late')],
  }));
  const result = await finalizeStorefrontBootstrap(
    payload([menu('enabled-plugin', 50)]),
    new Set(['enabled-plugin']),
  );
  assert.deepEqual(
    result.menus.map((item) => item.order),
    [1, 50],
  );
  resetHooks();
});

test('the i18n field rides the base payload through filters and pruning', async () => {
  resetHooks();
  const result = await finalizeStorefrontBootstrap(
    { ...payload([menu('enabled-plugin', 10)]), i18n: { default: 'en', enabled: ['en', 'fr'] } },
    new Set(['enabled-plugin']),
  );
  assert.deepEqual(result.i18n, { default: 'en', enabled: ['en', 'fr'] });
  resetHooks();
});

test('a filter fills brandAssets and the record survives pruning', async () => {
  resetHooks();
  addFilter(
    'storefront.bootstrap',
    (current: { menus: StoreMenuItem[]; brandAssets?: Record<string, string> }) => ({
      ...current,
      brandAssets: { ...current.brandAssets, hero: 'https://cdn.example/hero.webp' },
    }),
  );
  const result = await finalizeStorefrontBootstrap(
    { ...payload([menu('enabled-plugin', 10)]), brandAssets: {} as Record<string, string> },
    new Set(['enabled-plugin']),
  );
  assert.deepEqual(result.brandAssets, { hero: 'https://cdn.example/hero.webp' });
  resetHooks();
});
