import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, dirname } from 'node:path';
import {
  discoverDiskPlugins,
  isTuuchoPluginId,
  isUserPluginId,
  pluginRequiresDescription,
  resolvePluginDescription,
} from '../../../../../src/modules/plugins/application/discoverPlugins.js';

test('non-locale plugins require a description; locale packs may omit it', () => {
  assert.equal(pluginRequiresDescription('tuucho-commerce-gift', 'commerce'), true);
  assert.equal(pluginRequiresDescription('demo-page-guides', 'generic'), true);
  assert.equal(pluginRequiresDescription('tuucho-commerce-gift-locale-fr', 'locale'), false);
  assert.equal(pluginRequiresDescription('tuucho-locale-fr', 'locale'), false);
  assert.equal(pluginRequiresDescription('shop-notes-locale-fr', 'generic'), false);
  assert.equal(resolvePluginDescription('shop-notes', 'generic', ''), undefined);
  assert.equal(resolvePluginDescription('shop-notes', 'generic', '   '), undefined);
  assert.equal(resolvePluginDescription('shop-notes', 'generic', undefined), undefined);
  assert.equal(resolvePluginDescription('shop-notes', 'generic', 'Adds checkout notes.'), 'Adds checkout notes.');
  assert.equal(resolvePluginDescription('tuucho-locale-fr', 'locale', ''), '');
  assert.equal(resolvePluginDescription('tuucho-commerce-gift-locale-fr', 'locale', undefined), '');
});

test('tuucho ids are reserved for bundled plugins', () => {
  assert.equal(isTuuchoPluginId('tuucho-page-home'), true);
  assert.equal(isTuuchoPluginId('page-home'), false);
  assert.equal(isTuuchoPluginId('tuucho-'), false);
  assert.equal(isUserPluginId('demo-page-guides'), true);
  assert.equal(isUserPluginId('tuucho-page-home'), false);
});

test('disk plugins that require a description have one', async () => {
  const manifests = await discoverDiskPlugins();
  assert.ok(manifests.length > 0);
  for (const plugin of manifests) {
    if (pluginRequiresDescription(plugin.id, plugin.kind)) {
      assert.ok(plugin.description.trim(), plugin.id);
    }
  }
});

test('nested bundled plugins keep leaf folder = tuucho- id', async () => {
  const manifests = await discoverDiskPlugins();
  const bundled = manifests.filter((plugin) => plugin.sourceDir?.includes('/plugins/tuucho/'));
  assert.ok(bundled.length >= 50, `expected bundled plugins, got ${bundled.length}`);
  for (const plugin of bundled) {
    assert.ok(isTuuchoPluginId(plugin.id), plugin.id);
    assert.ok(plugin.sourceDir?.includes('/plugins/tuucho/'), plugin.sourceDir);
    assert.equal(basename(plugin.sourceDir ?? ''), plugin.id);
    assert.ok(plugin.installPath?.startsWith('plugins/tuucho/'), plugin.installPath);
    assert.ok(plugin.sourceDir?.replace(/\\/g, '/').endsWith(`/${plugin.installPath}`), plugin.installPath);
  }
  const ids = new Set(manifests.map((plugin) => plugin.id));
  assert.ok(ids.has('tuucho-docs-developer'));
  assert.ok(ids.has('tuucho-home-faq'));
  assert.ok(!ids.has('tuucho-page-faq'));
  assert.ok(ids.has('tuucho-commerce-vinted-review'));
  assert.ok(!ids.has('tuucho-commerce-reviews'));
  assert.ok(!ids.has('tuucho'));
  assert.ok(!ids.has('commerce'));
  assert.ok(!ids.has('gift'));
  assert.ok(!ids.has('faq'));
  assert.ok(!ids.has('demo'));
});

test('locale complements sit in the same feature folder as their parent', async () => {
  const manifests = await discoverDiskPlugins();
  const byId = new Map(manifests.map((plugin) => [plugin.id, plugin]));
  for (const plugin of manifests) {
    const match = plugin.id.match(/^(.+)-locale-[a-z]{2}$/);
    if (!match) continue;
    const parent = byId.get(match[1]);
    if (!parent) continue;
    assert.equal(dirname(plugin.sourceDir ?? ''), dirname(parent.sourceDir ?? ''), plugin.id);
  }
  const faq = byId.get('tuucho-home-faq');
  assert.ok(faq?.sourceDir?.includes('/plugins/tuucho/home/faq/'), faq?.sourceDir);
  const localeFr = byId.get('tuucho-locale-fr');
  assert.ok(localeFr?.sourceDir?.endsWith('/plugins/tuucho/locale/tuucho-locale-fr'), localeFr?.sourceDir);
  const demo = byId.get('demo-page-guides');
  const demoFr = byId.get('demo-page-guides-locale-fr');
  assert.equal(dirname(demo?.sourceDir ?? ''), dirname(demoFr?.sourceDir ?? ''));
  assert.ok(demo?.sourceDir?.includes('/plugins/user/demo/guides/'), demo?.sourceDir);
});

test('repository is kept for user plugins and ignored on tuucho-*', async () => {
  const manifests = await discoverDiskPlugins();
  const bundled = manifests.find((plugin) => plugin.id === 'tuucho-theme-default');
  const demo = manifests.find((plugin) => plugin.id === 'demo-page-guides');
  assert.equal(bundled?.repository, undefined);
  assert.equal(demo?.repository, undefined);
});

test('user plugins may nest under plugins/user and must not use tuucho-', async () => {
  const manifests = await discoverDiskPlugins();
  const demo = manifests.find((plugin) => plugin.id === 'demo-page-guides');
  assert.ok(demo, 'demo-page-guides');
  assert.equal(isUserPluginId(demo.id), true);
  assert.ok(demo.sourceDir?.includes('/plugins/user/demo/'), demo.sourceDir);
  assert.equal(basename(demo.sourceDir ?? ''), 'demo-page-guides');
  assert.equal(demo.installPath, 'plugins/user/demo/guides/demo-page-guides');
  const legal = manifests.find((plugin) => plugin.id === 'page-legal');
  const legalFr = manifests.find((plugin) => plugin.id === 'page-legal-locale-fr');
  assert.ok(legal, 'page-legal');
  assert.ok(legalFr, 'page-legal-locale-fr');
  assert.equal(isUserPluginId(legal.id), true);
  assert.equal(isTuuchoPluginId(legal.id), false);
  assert.ok(legal.sourceDir?.includes('/plugins/user/legal/pages/'), legal.sourceDir);
  assert.equal(basename(legal.sourceDir ?? ''), 'page-legal');
  assert.equal(legal.installPath, 'plugins/user/legal/pages/page-legal');
  assert.equal(legalFr.installPath, 'plugins/user/legal/pages/page-legal-locale-fr');
  assert.equal(dirname(legal.sourceDir ?? ''), dirname(legalFr.sourceDir ?? ''));
  assert.ok(!manifests.some((plugin) => plugin.id === 'tuucho-page-legal'));
  const accessibility = manifests.find((plugin) => plugin.id === 'page-accessibility');
  const accessibilityFr = manifests.find((plugin) => plugin.id === 'page-accessibility-locale-fr');
  const footerIdentity = manifests.find((plugin) => plugin.id === 'footer-identity');
  assert.ok(accessibility, 'page-accessibility');
  assert.ok(accessibilityFr, 'page-accessibility-locale-fr');
  assert.ok(footerIdentity, 'footer-identity');
  assert.equal(isUserPluginId(accessibility.id), true);
  assert.equal(isTuuchoPluginId(accessibility.id), false);
  assert.equal(isUserPluginId(footerIdentity.id), true);
  assert.equal(accessibility.installPath, 'plugins/user/legal/pages/page-accessibility');
  assert.equal(accessibilityFr.installPath, 'plugins/user/legal/pages/page-accessibility-locale-fr');
  assert.equal(footerIdentity.installPath, 'plugins/user/footer/identity/footer-identity');
  assert.equal(accessibility.route, '/accessibility');
  assert.equal(accessibility.nav, undefined);
});
