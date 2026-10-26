import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  canonicalPluginConfigHash,
  classifyImportFile,
  loadPluginConfigFiles,
  pluginConfigFilesView,
  pluginPublicSettingsUnset,
  pluginSecretsUnset,
  resolvePluginConfigDir,
  splitSchemaKeys,
} from '../../../../../src/modules/plugins/application/pluginConfigFiles.js';
import type { PluginManifest } from '../../../../../src/modules/plugins/domain/contracts.js';

test('splitSchemaKeys separates secrets from public settings', () => {
  const split = splitSchemaKeys({
    clientId: { type: 'string', label: 'id', description: 'id' },
    appSecret: { type: 'secret', label: 'secret', description: 'secret' },
  });
  assert.deepEqual(split.publicKeys, ['clientId']);
  assert.deepEqual(split.secretKeys, ['appSecret']);
});

test('bundled plugins always resolve under tuucho-config/plugins/<id>', () => {
  const dir = resolvePluginConfigDir({
    id: 'tuucho-signin-google',
    name: 'Google',
    version: '1.0.0',
    kind: 'generic',
    description: 'x',
    sourceDir: '/tmp/not-used',
    configDir: 'config',
  });
  assert.ok(dir?.replaceAll('\\', '/').endsWith('tuucho-config/plugins/tuucho-signin-google'));
});

test('user plugin configDir may not escape the package', () => {
  const packageDir = mkdtempSync(join(tmpdir(), 'plugin-pkg-'));
  assert.equal(
    resolvePluginConfigDir({
      id: 'page-legal',
      name: 'Legal',
      version: '1.0.0',
      kind: 'page',
      description: 'x',
      sourceDir: packageDir,
      configDir: '../escape',
    }),
    null,
  );
  assert.equal(
    resolvePluginConfigDir({
      id: 'page-legal',
      name: 'Legal',
      version: '1.0.0',
      kind: 'page',
      description: 'x',
      sourceDir: packageDir,
    }),
    packageDir,
  );
});

test('loadPluginConfigFiles merges public then private-or-example', () => {
  const root = mkdtempSync(join(tmpdir(), 'plugin-cfg-'));
  writeFileSync(join(root, 'config.json'), JSON.stringify({ clientId: 'from-common', extra: 1 }));
  writeFileSync(join(root, 'config.private.example.json'), JSON.stringify({ appSecret: 'example-secret' }));
  const loaded = loadPluginConfigFiles({
    id: 'page-legal',
    name: 'Legal',
    version: '1.0.0',
    kind: 'page',
    description: 'x',
    sourceDir: root,
    settingsSchema: {
      clientId: { type: 'string', label: 'id', description: 'id' },
      appSecret: { type: 'secret', label: 's', description: 's' },
    },
  });
  assert.equal(loaded.present, true);
  assert.equal(loaded.public.clientId, 'from-common');
  assert.equal(loaded.public.extra, undefined);
  assert.equal(loaded.private.appSecret, 'example-secret');
  assert.ok(loaded.warnings.some((line) => line.includes('missing')));
  assert.equal(loaded.hash, canonicalPluginConfigHash(loaded.public, loaded.private));
});

test('env public overlay wins over common public', () => {
  const root = mkdtempSync(join(tmpdir(), 'plugin-cfg-env-'));
  writeFileSync(join(root, 'config.json'), JSON.stringify({ clientId: 'common' }));
  writeFileSync(join(root, 'config.dev.json'), JSON.stringify({ clientId: 'env' }));
  const previous = process.env.APP_TARGET;
  process.env.APP_TARGET = 'dev';
  try {
    const loaded = loadPluginConfigFiles({
      id: 'page-legal',
      name: 'Legal',
      version: '1.0.0',
      kind: 'page',
      description: 'x',
      sourceDir: root,
      settingsSchema: { clientId: { type: 'string', label: 'id', description: 'id' } },
    });
    assert.equal(loaded.public.clientId, 'env');
  } finally {
    if (previous === undefined) delete process.env.APP_TARGET;
    else process.env.APP_TARGET = previous;
  }
});

test('classifyImportFile rejects secrets in a public payload', () => {
  const schema = {
    clientId: { type: 'string' as const, label: 'id', description: 'id' },
    appSecret: { type: 'secret' as const, label: 's', description: 's' },
  };
  const mixed = classifyImportFile('config.json', { clientId: 'x', appSecret: 'leak' }, schema);
  assert.deepEqual(mixed, { error: 'mixed_public' });
  const priv = classifyImportFile('config.private.json', { appSecret: 'ok', clientId: 'nope' }, schema);
  assert.ok(!('error' in priv));
  assert.equal(priv.private.appSecret, 'ok');
  assert.equal(priv.public.clientId, undefined);
});

test('drift is only when files exist and their hash differs from an applied stamp', () => {
  const root = mkdtempSync(join(tmpdir(), 'plugin-cfg-drift-'));
  const emptyManifest: PluginManifest = {
    id: 'page-legal',
    name: 'Legal',
    version: '1.0.0',
    kind: 'page',
    description: 'x',
    sourceDir: root,
    settingsSchema: { clientId: { type: 'string', label: 'id', description: 'id' } },
  };
  const none = pluginConfigFilesView(emptyManifest, null);
  assert.equal(none.present, false);
  assert.equal(none.differ, false);

  writeFileSync(join(root, 'config.json'), JSON.stringify({ clientId: 'disk' }));
  const firstLaunch = pluginConfigFilesView(emptyManifest, null);
  assert.equal(firstLaunch.present, true);
  assert.equal(firstLaunch.differ, false);

  const same = pluginConfigFilesView(emptyManifest, firstLaunch.hash);
  assert.equal(same.differ, false);

  writeFileSync(join(root, 'config.json'), JSON.stringify({ clientId: 'changed' }));
  const drifted = pluginConfigFilesView(emptyManifest, firstLaunch.hash);
  assert.equal(drifted.present, true);
  assert.equal(drifted.differ, true);
});

test('unset detection treats defaults and blanks as not set up', () => {
  assert.equal(pluginPublicSettingsUnset({ clientId: '' }, { clientId: '' }, ['clientId']), true);
  assert.equal(pluginPublicSettingsUnset({ clientId: 'live' }, { clientId: '' }, ['clientId']), false);
  assert.equal(pluginSecretsUnset({}), true);
  assert.equal(pluginSecretsUnset({ appSecret: 'x' }), false);
});

test('file routes use import/export permissions; Configure PATCH stays preferences', () => {
  const plugins = readFileSync(resolve('src/modules/plugins/http/adminPlugins.router.ts'), 'utf8');
  const files = readFileSync(
    resolve('src/modules/plugins/http/adminPluginConfigFiles.router.ts'),
    'utf8',
  );
  assert.match(plugins, /adminPluginsRouter\.use\('\/plugins', requireAuth, requirePermission\('preferences'\)\)/);
  assert.match(files, /requirePermission\('preferences'\)/);
  assert.match(
    files,
    /config-files\/apply[\s\S]{0,80}requirePermission\('plugin_config_import'\)/,
  );
  assert.match(
    files,
    /config-files\/import[\s\S]{0,80}requirePermission\('plugin_config_import'\)/,
  );
  assert.match(
    files,
    /config-files\/export[\s\S]{0,80}requirePermission\('plugin_config_export'\)/,
  );
  assert.match(files, /config-files\/apply-all[\s\S]{0,80}requirePermission\('plugin_config_import'\)/);
  assert.match(files, /config-files\/import-all[\s\S]{0,80}requirePermission\('plugin_config_import'\)/);
  assert.match(files, /config-files\/export-all[\s\S]{0,80}requirePermission\('plugin_config_export'\)/);
  assert.match(plugins, /adminPluginsRouter\.patch\('\/plugins\/:id'/);
  assert.doesNotMatch(plugins, /plugin_config_/);
  assert.doesNotMatch(files, /patch\('\/plugins\/:id'/);
});

test('Configure file chrome hides actions without the matching grant', () => {
  const front = readFileSync(
    resolve('../front/src/routes/AdminPluginConfigFiles.tsx'),
    'utf8',
  );
  assert.match(front, /canAccess\(access, 'plugin_config_import'\)/);
  assert.match(front, /canAccess\(access, 'plugin_config_export'\)/);
  assert.match(front, /KERNEL_UI\.FileField|from '\.\.\/components\/ui\/FileField'/);
  assert.doesNotMatch(front, /<input[^>]*type=["']file["']/);
  const bulk = readFileSync(resolve('../front/src/routes/AdminPluginConfigBulk.tsx'), 'utf8');
  assert.match(bulk, /canAccess\(access, 'plugin_config_import'\)/);
  assert.match(bulk, /canAccess\(access, 'plugin_config_export'\)/);
  assert.match(bulk, /from '\.\.\/components\/ui\/FileField'/);
  assert.doesNotMatch(bulk, /<input[^>]*type=["']file["']/);
  const list = readFileSync(resolve('../front/src/routes/AdminPluginsPage.tsx'), 'utf8');
  assert.match(list, /<AdminPluginConfigBulk/);
});

test('Configure puts the file-config block above the schema form', () => {
  const page = readFileSync(resolve('../front/src/routes/AdminPluginConfigurePage.tsx'), 'utf8');
  const files = page.indexOf('<AdminPluginConfigFiles');
  const schema = page.indexOf('<SettingsForm');
  const theme = page.indexOf('<ThemeForm');
  assert.ok(files >= 0 && schema >= 0 && theme >= 0);
  assert.ok(files < schema, 'file-config must sit above SettingsForm');
  assert.ok(files < theme, 'file-config must sit above ThemeForm');
});
