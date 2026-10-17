import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  assertPluginMigrationSql,
  listPluginMigrationFiles,
  loadPluginMigration,
  pluginMigrationsDir,
  pluginTablePrefix,
} from '../../../../../src/modules/plugins/application/pluginSchema.js';
import { repoRoot } from '../../../../../src/modules/plugins/application/discoverPlugins.js';

test('plugin tables are namespaced with the plugin id', () => {
  assert.equal(pluginTablePrefix('shop-notes'), 'plugin_shop_notes_');
});

test('plugin migrations may only mutate their own tables', () => {
  const id = 'shop-notes';
  assert.doesNotThrow(() =>
    assertPluginMigrationSql(id, 'create table plugin_shop_notes_notes (id uuid primary key)'),
  );
  assert.doesNotThrow(() => assertPluginMigrationSql(id, 'drop table if exists plugin_shop_notes_notes'));
  assert.throws(
    () => assertPluginMigrationSql(id, 'alter table products add column extra text'),
    /plugin_shop_notes_/,
  );
  assert.throws(
    () => assertPluginMigrationSql(id, 'insert into carts (id) values (null)'),
    /plugin_shop_notes_/,
  );
  assert.throws(
    () => assertPluginMigrationSql(id, 'drop table if exists products cascade'),
    /plugin_shop_notes_/,
  );
});

test('tuucho-mail-spy ships namespaced up/down tables', async () => {
  const dir = pluginMigrationsDir({
    id: 'tuucho-mail-spy',
    sourceDir: join(repoRoot(), 'plugins/tuucho/messaging/mail-spy/tuucho-mail-spy'),
  });
  const files = await listPluginMigrationFiles(dir);
  assert.deepEqual(files, ['001_spy_mail.js']);
  const mod = loadPluginMigration(join(dir, files[0]!));
  const sql: string[] = [];
  const client = {
    query: async (text: string) => {
      sql.push(text);
      return { rows: [] };
    },
  };
  await mod.up!(client as never);
  await mod.down!(client as never);
  for (const statement of sql) assertPluginMigrationSql('tuucho-mail-spy', statement);
  assert.match(sql.join('\n'), /plugin_tuucho_mail_spy_channels/);
  assert.match(sql.join('\n'), /plugin_tuucho_mail_spy_recipients/);
});

test('plugin table prefix never collides with host plugins_ tables', () => {
  assert.equal(pluginTablePrefix('schema'), 'plugin_schema_');
  assert.notEqual(pluginTablePrefix('schema'), 'plugins_schema_');
});
