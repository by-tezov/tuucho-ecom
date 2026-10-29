import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  SKIP_DIR_NAMES,
  discoverDiskPlugins,
  hasTuuchoDiscriminator,
  isTuuchoPluginId,
  isUserPluginId,
  localeComplementIdsFor,
  localeComplementParentId,
  pluginRequiresDescription,
  resolvePluginDescription,
} from '../../../../../src/modules/plugins/application/discoverPlugins.js';

test('tuucho discriminator rejects npm packages and accepts plugin package.json', () => {
  assert.equal(hasTuuchoDiscriminator({ name: 'left-pad', version: '1.0.0' }), false);
  assert.equal(hasTuuchoDiscriminator({ tuucho: { id: 'gift-wrap' } }), true);
  assert.equal(SKIP_DIR_NAMES.has('node_modules'), true);
});

test('disk plugins are package.json with tuucho, never plugin.json', async () => {
  const manifests = await discoverDiskPlugins();
  assert.ok(manifests.length > 0);
  for (const plugin of manifests) {
    assert.ok(plugin.sourceDir, plugin.id);
    assert.equal(existsSync(join(plugin.sourceDir, 'plugin.json')), false, plugin.id);
    assert.equal(existsSync(join(plugin.sourceDir, 'package.json')), true, plugin.id);
  }
});

test('non-locale plugins require a description; locale packs may omit it', () => {
  assert.equal(pluginRequiresDescription('tuucho-commerce-gift', 'commerce'), true);
  assert.equal(pluginRequiresDescription('page-guides', 'generic'), true);
  assert.equal(pluginRequiresDescription('tuucho-commerce-gift-locale-fr', 'locale'), false);
  assert.equal(pluginRequiresDescription('tuucho-kernel-locale-fr', 'locale'), false);
  assert.equal(pluginRequiresDescription('shop-notes-locale-fr', 'generic'), false);
  assert.equal(resolvePluginDescription('shop-notes', 'generic', ''), undefined);
  assert.equal(resolvePluginDescription('shop-notes', 'generic', '   '), undefined);
  assert.equal(resolvePluginDescription('shop-notes', 'generic', undefined), undefined);
  assert.equal(resolvePluginDescription('shop-notes', 'generic', 'Adds checkout notes.'), 'Adds checkout notes.');
  assert.equal(resolvePluginDescription('tuucho-kernel-locale-fr', 'locale', ''), '');
  assert.equal(resolvePluginDescription('tuucho-commerce-gift-locale-fr', 'locale', undefined), '');
});

test('locale complements follow the parent plugin id, not the product locale pack', () => {
  assert.equal(localeComplementParentId('tuucho-journal-api-locale-fr'), 'tuucho-journal-api');
  assert.equal(localeComplementParentId('tuucho-commerce-gift-locale-fr'), 'tuucho-commerce-gift');
  assert.equal(localeComplementParentId('page-guides-locale-fr'), 'page-guides');
  assert.equal(localeComplementParentId('tuucho-kernel-locale-en'), null);
  assert.equal(localeComplementParentId('tuucho-kernel-locale-fr'), null);
  assert.equal(localeComplementParentId('tuucho-journal-api'), null);
  assert.deepEqual(
    localeComplementIdsFor('tuucho-journal-api', [
      'tuucho-journal-api',
      'tuucho-journal-api-locale-en',
      'tuucho-journal-api-locale-fr',
      'tuucho-journal-admin',
      'tuucho-journal-cron',
      'tuucho-kernel-locale-en',
      'tuucho-kernel-locale-fr',
    ]),
    ['tuucho-journal-api-locale-en', 'tuucho-journal-api-locale-fr'],
  );
});

test('tuucho ids are reserved for bundled plugins', () => {
  assert.equal(isTuuchoPluginId('tuucho-theme-default'), true);
  assert.equal(isTuuchoPluginId('page-home'), false);
  assert.equal(isTuuchoPluginId('tuucho-'), false);
  assert.equal(isUserPluginId('page-guides'), true);
  assert.equal(isUserPluginId('page-home'), true);
});

test('disk plugins that require a description have one', async () => {
  const manifests = await discoverDiskPlugins();
  assert.ok(manifests.length > 0);
  for (const plugin of manifests) {
    if (pluginRequiresDescription(plugin.id, plugin.kinds)) {
      assert.ok(plugin.description.trim(), plugin.id);
    }
  }
});

test('nested bundled plugins keep leaf folder = tuucho- id', async () => {
  const manifests = await discoverDiskPlugins();
  const bundled = manifests.filter((plugin) =>
    plugin.sourceDir?.replaceAll('\\', '/').includes('/tuucho/plugins/'),
  );
  assert.ok(bundled.length >= 50, `expected bundled plugins, got ${bundled.length}`);
  for (const plugin of bundled) {
    assert.ok(isTuuchoPluginId(plugin.id), plugin.id);
    assert.ok(plugin.sourceDir?.includes('/tuucho/plugins/'), plugin.sourceDir);
    assert.equal(basename(plugin.sourceDir ?? ''), plugin.id);
    assert.ok(plugin.installPath?.startsWith('tuucho/plugins/'), plugin.installPath);
    assert.ok(plugin.sourceDir?.replace(/\\/g, '/').endsWith(`/${plugin.installPath}`), plugin.installPath);
  }
  const ids = new Set(manifests.map((plugin) => plugin.id));
  assert.ok(ids.has('tuucho-docs-developer'));
  assert.ok(ids.has('home-faq'));
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
  const faq = byId.get('home-faq');
  assert.ok(faq?.sourceDir?.includes('/src/plugins/home/faq/'), faq?.sourceDir);
  const ids = manifests.map((plugin) => plugin.id);
  assert.deepEqual(localeComplementIdsFor('tuucho-journal-api', ids), [
    'tuucho-journal-api-locale-en',
    'tuucho-journal-api-locale-fr',
  ]);
  assert.ok(!localeComplementIdsFor('tuucho-journal-api', ids).includes('tuucho-journal-admin'));
  const localeEn = byId.get('tuucho-kernel-locale-en');
  assert.ok(localeEn?.sourceDir?.endsWith('/plugins/kernel-locale/tuucho-kernel-locale-en'), localeEn?.sourceDir);
  const localeFr = byId.get('tuucho-kernel-locale-fr');
  assert.ok(localeFr?.sourceDir?.endsWith('/plugins/kernel-locale/tuucho-kernel-locale-fr'), localeFr?.sourceDir);
  const demo = byId.get('page-guides');
  const demoFr = byId.get('page-guides-locale-fr');
  assert.equal(dirname(demo?.sourceDir ?? ''), dirname(demoFr?.sourceDir ?? ''));
  assert.ok(demo?.sourceDir?.includes('/src/plugins/demo/guides/'), demo?.sourceDir);
});

test('repository is kept for user plugins and ignored on tuucho-*', async () => {
  const manifests = await discoverDiskPlugins();
  const bundled = manifests.find((plugin) => plugin.id === 'tuucho-theme-default');
  const demo = manifests.find((plugin) => plugin.id === 'page-guides');
  assert.equal(bundled?.repository, undefined);
  assert.equal(demo?.repository, undefined);
});

test('every settingsSchema field has a non-empty label and description', async () => {
  const manifests = await discoverDiskPlugins();
  let fields = 0;
  for (const plugin of manifests) {
    const schema = plugin.settingsSchema;
    if (!schema) continue;
    for (const [key, field] of Object.entries(schema)) {
      fields += 1;
      assert.ok(field.label.trim(), `${plugin.id}.${key} label`);
      assert.ok(field.description.trim(), `${plugin.id}.${key} description`);
    }
  }
  assert.ok(fields >= 20, `expected bundled schema fields, got ${fields}`);
});

test('parser keeps url, section, description, and long secrets', async () => {
  const manifests = await discoverDiskPlugins();
  const byId = new Map(manifests.map((plugin) => [plugin.id, plugin]));
  const facebook = byId.get('tuucho-signin-facebook');
  assert.equal(facebook?.settingsSchema?.oauthReturnUrl?.type, 'url');
  assert.ok(facebook?.settingsSchema?.appId?.description?.trim());
  assert.equal(facebook?.settingsSchema?.appId?.section, 'app');
  const apple = byId.get('tuucho-signin-apple');
  assert.equal(apple?.settingsSchema?.privateKey?.long, true);
  const stripe = byId.get('tuucho-payment-stripe');
  assert.equal(stripe?.settingsSchema?.secretKey?.type, 'secret');
  const contact = byId.get('tuucho-contact');
  assert.equal(contact?.settingsSchema?.fromEmail?.type, 'email');
});

test('user plugins may nest under plugins/user and must not use tuucho-', async () => {
  const manifests = await discoverDiskPlugins();
  const demo = manifests.find((plugin) => plugin.id === 'page-guides');
  assert.ok(demo, 'page-guides');
  assert.equal(isUserPluginId(demo.id), true);
  assert.ok(demo.sourceDir?.includes('/src/plugins/demo/'), demo.sourceDir);
  assert.equal(basename(demo.sourceDir ?? ''), 'page-guides');
  assert.equal(demo.installPath, 'src/plugins/demo/guides/page-guides');
  const legal = manifests.find((plugin) => plugin.id === 'page-legal');
  const legalFr = manifests.find((plugin) => plugin.id === 'page-legal-locale-fr');
  assert.ok(legal, 'page-legal');
  assert.ok(legalFr, 'page-legal-locale-fr');
  assert.equal(isUserPluginId(legal.id), true);
  assert.equal(isTuuchoPluginId(legal.id), false);
  assert.ok(legal.sourceDir?.includes('/src/plugins/legal/'), legal.sourceDir);
  assert.equal(basename(legal.sourceDir ?? ''), 'page-legal');
  assert.equal(legal.installPath, 'src/plugins/legal/legal/page-legal');
  assert.equal(legalFr.installPath, 'src/plugins/legal/legal/page-legal-locale-fr');
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
  assert.equal(accessibility.installPath, 'src/plugins/legal/accessibility/page-accessibility');
  assert.equal(accessibilityFr.installPath, 'src/plugins/legal/accessibility/page-accessibility-locale-fr');
  assert.equal(footerIdentity.installPath, 'src/plugins/footer/identity/footer-identity');
  assert.equal(accessibility.route, '/accessibility');
  assert.equal(accessibility.nav, undefined);
});
