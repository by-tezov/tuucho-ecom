import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import {
  isPluginEnabled,
  listPlugins,
  patchPluginSecrets,
  patchPluginSettings,
  PluginsTableMissingError,
  scanPlugins,
  uninstallPlugin,
} from '../../../../../src/modules/plugins/application/pluginStore.js';

/** Simulates boot-before-migrate: every statement hits a missing `plugins` table. */
const undefinedTableDb = {
  query: async () => {
    throw Object.assign(new Error('relation "plugins" does not exist'), { code: '42P01' });
  },
} as unknown as Pool;

// A real bundled plugin id: manifestById must find it on disk so the tests
// reach the database call.
const KNOWN_PLUGIN = 'page-home';

test('isPluginEnabled returns false when the plugins table is missing', async () => {
  assert.equal(await isPluginEnabled(KNOWN_PLUGIN, undefinedTableDb), false);
});

test('listPlugins still degrades to an empty list when the plugins table is missing', async () => {
  assert.deepEqual(await listPlugins(undefinedTableDb), []);
});

test('scanPlugins throws a typed plugins_table_missing error', async () => {
  await assert.rejects(scanPlugins(undefinedTableDb), (error: unknown) => {
    assert.ok(error instanceof PluginsTableMissingError);
    assert.equal(error.code, 'plugins_table_missing');
    return true;
  });
});

test('uninstallPlugin throws a typed plugins_table_missing error', async () => {
  await assert.rejects(uninstallPlugin(KNOWN_PLUGIN, true, undefinedTableDb), (error: unknown) => {
    assert.ok(error instanceof PluginsTableMissingError);
    assert.equal(error.code, 'plugins_table_missing');
    return true;
  });
});

test('patchPluginSettings throws a typed plugins_table_missing error', async () => {
  await assert.rejects(
    patchPluginSettings(KNOWN_PLUGIN, { title: 'x' }, undefinedTableDb),
    (error: unknown) => {
      assert.ok(error instanceof PluginsTableMissingError);
      assert.equal(error.code, 'plugins_table_missing');
      return true;
    },
  );
});

test('patchPluginSecrets throws a typed plugins_table_missing error', async () => {
  await assert.rejects(
    patchPluginSecrets(KNOWN_PLUGIN, { apiKey: 'secret' }, undefinedTableDb),
    (error: unknown) => {
      assert.ok(error instanceof PluginsTableMissingError);
      assert.equal(error.code, 'plugins_table_missing');
      return true;
    },
  );
});

test('non-42P01 errors still propagate unchanged', async () => {
  const boom = new Error('connection reset');
  const db = {
    query: async () => {
      throw boom;
    },
  } as unknown as Pool;
  await assert.rejects(isPluginEnabled(KNOWN_PLUGIN, db), (error: unknown) => error === boom);
  await assert.rejects(scanPlugins(db), (error: unknown) => error === boom);
});
