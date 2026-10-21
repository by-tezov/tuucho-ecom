import type { Pool } from 'pg';
import { pool } from '../../../db/pool.js';
import type { JsonObject } from '../../../config/loadJsonConfig.js';
import {
  loadPluginConfigFiles,
  pluginPublicSettingsUnset,
  pluginSecretsUnset,
  splitSchemaKeys,
} from './pluginConfigFiles.js';
import {
  getCachedPluginSecrets,
  listPlugins,
  patchPluginSecrets,
  patchPluginSettings,
  stampPluginConfigFiles,
  type InstalledPlugin,
} from './pluginStore.js';

export async function writePluginConfigToDb(
  plugin: InstalledPlugin,
  publicObj: JsonObject,
  privateObj: JsonObject,
  hash: string,
  db: Pool = pool,
): Promise<void> {
  if (Object.keys(publicObj).length > 0) await patchPluginSettings(plugin.id, publicObj, db);
  if (Object.keys(privateObj).length > 0) await patchPluginSecrets(plugin.id, privateObj, db);
  await stampPluginConfigFiles(plugin.id, hash, db);
}

export async function applyPluginConfigFromDisk(
  plugin: InstalledPlugin,
  db: Pool = pool,
): Promise<{ ok: true; warnings: string[] } | { ok: false; error: 'not_found' | 'no_files' }> {
  const loaded = loadPluginConfigFiles(plugin.manifest);
  if (!loaded.present) return { ok: false, error: 'no_files' };
  for (const warning of loaded.warnings) console.warn(`[plugins] ${warning}`);
  await writePluginConfigToDb(plugin, loaded.public, loaded.private, loaded.hash ?? '', db);
  return { ok: true, warnings: loaded.warnings };
}

async function pluginConfigFileColumnsReady(db: Pool): Promise<boolean> {
  try {
    await db.query(`select config_files_hash, config_files_applied_at from plugins limit 0`);
    return true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === '42703' || code === '42P01') return false;
    throw error;
  }
}

/** First launch only: empty operator values + files exist → load once. */
export async function seedPluginConfigFilesOnce(db: Pool = pool): Promise<void> {
  if (!(await pluginConfigFileColumnsReady(db))) return;
  const plugins = await listPlugins(db);
  for (const plugin of plugins) {
    if (plugin.configFilesAppliedAt) continue;
    const schema = plugin.manifest.settingsSchema;
    if (!schema || Object.keys(schema).length === 0) continue;
    const { publicKeys } = splitSchemaKeys(schema);
    if (
      !pluginPublicSettingsUnset(plugin.settings, plugin.manifest.defaultSettings, publicKeys) ||
      !pluginSecretsUnset(getCachedPluginSecrets(plugin.id))
    ) {
      continue;
    }
    const loaded = loadPluginConfigFiles(plugin.manifest);
    if (!loaded.present) continue;
    for (const warning of loaded.warnings) console.warn(`[plugins] ${warning}`);
    await writePluginConfigToDb(plugin, loaded.public, loaded.private, loaded.hash ?? '', db);
  }
}
