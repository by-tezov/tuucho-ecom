import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  addFilter,
  applyFilters,
  createPluginRegisterApi,
  peekPluginService,
  registerPaymentGateway,
  resetHooks,
  resetPluginServices,
  resetShells,
  unregisterPaymentGateway,
} from '@tuucho/plugin-sdk';
import { pluginSurfaceEnabled } from '../../../../../src/modules/plugins/application/pluginSurface.js';
import { loadManifests } from '../../../../../src/modules/plugins/application/catalog.js';
import { repoRoot } from '../../../../../src/modules/plugins/application/discoverPlugins.js';
import { ensurePluginImportHook } from '../../../../../src/modules/plugins/application/loadPluginRuntime.js';
import { getStripe } from '../../../../../src/platform/stripe/stripeClient.js';

ensurePluginImportHook();

test('checkout.quote filters run in priority order', async () => {
  resetHooks();
  addFilter('checkout.quote', (quote: { total: number }) => {
    quote.total += 1;
    return quote;
  }, 10);
  addFilter('checkout.quote', (quote: { total: number }) => {
    quote.total += 10;
    return quote;
  }, 20);
  const out = await applyFilters('checkout.quote', { total: 0 });
  assert.equal(out.total, 11);
});

test('dependsOn all fails closed when a parent is missing from disk', () => {
  const child = { id: 'tuucho-journal-admin', enabled: true, manifest: { dependsOn: ['tuucho-journal-api'] } };
  const byId = new Map([['tuucho-journal-admin', child]]);
  assert.equal(pluginSurfaceEnabled(child, byId), false);
});

test('dependsOnMode any needs one enabled parent', () => {
  const shippingHome = { id: 'tuucho-shipping-home', enabled: true, manifest: {} };
  const cron = {
    id: 'tuucho-shipping-expedition-cron',
    enabled: true,
    manifest: { dependsOn: ['tuucho-shipping-home', 'tuucho-shipping-mondial-relay'], dependsOnMode: 'any' as const },
  };
  const byId = new Map<string, typeof shippingHome | typeof cron>([
    ['tuucho-shipping-home', shippingHome],
    ['tuucho-shipping-expedition-cron', cron],
  ]);
  assert.equal(pluginSurfaceEnabled(cron, byId), true);
  shippingHome.enabled = false;
  assert.equal(pluginSurfaceEnabled(cron, byId), false);
});

test('disk catalogue includes bundled plugins and the demo user plugin', async () => {
  const manifests = await loadManifests();
  const ids = new Set(manifests.map((plugin) => plugin.id));
  for (const id of [
    'tuucho-theme-default',
    'tuucho-page-home',
    'tuucho-payment-stripe',
    'tuucho-commerce-loyalty',
    'tuucho-contact',
    'tuucho-mail-spy',
    'tuucho-seo-sitemap',
    'tuucho-seo-robots',
    'tuucho-seo-redirects',
    'demo-page-guides',
    'page-legal',
    'page-accessibility',
    'footer-identity',
  ]) {
    assert.ok(ids.has(id), id);
  }
  assert.ok(!ids.has('tuucho-page-legal'));
});

test('page-guides plugin contributes pose and capsules sitemap URLs', async () => {
  resetHooks();
  const href = pathToFileURL(
    join(repoRoot(), 'src/plugins/demo/guides/demo-page-guides/back/register.ts'),
  ).href;
  const mod = (await import(href)) as { register: (api: ReturnType<typeof createPluginRegisterApi>) => void };
  const api = createPluginRegisterApi('demo-page-guides', {
    id: 'demo-page-guides',
    name: 'Guides',
    version: '1.0.0',
    kind: 'page',
    description: 'guides',
  });
  await mod.register(api);
  const entries = await applyFilters<Array<{ loc?: string; source?: string }>>('seo.sitemap.entries', []);
  assert.ok(entries.some((entry) => entry.loc?.endsWith('/pose') && entry.source === 'demo-page-guides'));
  assert.ok(entries.some((entry) => entry.loc?.endsWith('/capsules') && entry.source === 'demo-page-guides'));
});

test('seo-robots plugin contributes Disallow rules', async () => {
  resetHooks();
  const href = pathToFileURL(
    join(repoRoot(), 'tuucho/plugins/seo/robots/tuucho-seo-robots/back/register.ts'),
  ).href;
  const mod = (await import(href)) as { register: (api: ReturnType<typeof createPluginRegisterApi>) => void };
  const api = createPluginRegisterApi('tuucho-seo-robots', {
    id: 'tuucho-seo-robots',
    name: 'Robots rules',
    version: '1.0.0',
    kind: 'seo',
    description: 'robots',
  });
  await mod.register(api);
  const rules = await applyFilters<Array<{ directive: string; value: string }>>('seo.robots.rules', []);
  assert.ok(rules.some((rule) => rule.directive === 'Disallow' && rule.value === '/admin'));
});

test('payment client is absent until a gateway registers, and gone after disable', () => {
  resetShells();
  assert.equal(getStripe(), undefined);
  registerPaymentGateway({
    id: 'example-gateway',
    methods: ['card'],
    getClient: () => ({ opaque: true }),
  });
  assert.equal((getStripe() as { opaque: boolean }).opaque, true);
  unregisterPaymentGateway('example-gateway');
  assert.equal(getStripe(), undefined);
});

test('loyalty service is absent until that plugin registers', () => {
  resetPluginServices();
  assert.equal(peekPluginService('tuucho-commerce-loyalty'), undefined);
});

test('gift, contact, and product-requests register spy channels', async () => {
  resetHooks();
  const plugins = [
    ['tuucho-commerce-gift', 'tuucho/plugins/commerce/gift/tuucho-commerce-gift/back/register.ts'],
    ['tuucho-contact', 'tuucho/plugins/messaging/contact/tuucho-contact/back/register.ts'],
    [
      'tuucho-commerce-product-requests',
      'tuucho/plugins/commerce/product-requests/tuucho-commerce-product-requests/back/register.ts',
    ],
  ] as const;
  for (const [id, rel] of plugins) {
    const href = pathToFileURL(join(repoRoot(), rel)).href;
    const mod = (await import(href)) as { register: (api: ReturnType<typeof createPluginRegisterApi>) => void };
    const api = createPluginRegisterApi(id, {
      id,
      name: id,
      version: '1.0.0',
      kind: 'generic',
      description: id,
    });
    await mod.register(api);
  }
  const channels = await applyFilters<Array<{ id: string; pluginId: string }>>('mail.spy.channels', []);
  assert.ok(channels.some((channel) => channel.id === 'gift_created' && channel.pluginId === 'tuucho-commerce-gift'));
  assert.ok(channels.some((channel) => channel.id === 'contact.inbound' && channel.pluginId === 'tuucho-contact'));
  assert.ok(channels.some((channel) => channel.id === 'contact.chat' && channel.pluginId === 'tuucho-contact'));
  assert.ok(
    channels.some(
      (channel) => channel.id === 'product_request' && channel.pluginId === 'tuucho-commerce-product-requests',
    ),
  );
});

