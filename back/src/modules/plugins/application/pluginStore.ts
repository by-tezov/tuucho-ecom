import type { Pool, PoolClient } from 'pg';
import { pool } from '../../../db/pool.js';
import { CORE_VERSION } from '../domain/coreVersion.js';
import { loadManifests, manifestById } from './catalog.js';
import { doAction } from './hooks.js';
import { ensureMenuForPlugin } from './storeSettings.js';
import { pluginSurfaceEnabled } from './pluginSurface.js';
import { assessPluginCompatibility, type PluginCompatibility } from './pluginCompatibility.js';
import type { PluginManifest } from '../domain/contracts.js';

export { pluginSurfaceEnabled } from './pluginSurface.js';

export interface InstalledPlugin {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  manifest: PluginManifest;
  compatibility: PluginCompatibility;
}

export { CORE_VERSION };

export async function ensurePluginRows(db: Pool | PoolClient = pool): Promise<PluginManifest[]> {
  const manifests = await loadManifests();
  for (const plugin of manifests) {
    const seedEnabled = plugin.defaultEnabled !== false;
    await db.query(
      `insert into plugins (id, enabled, settings)
       values ($1, $2, $3::jsonb)
       on conflict (id) do nothing`,
      [plugin.id, seedEnabled, JSON.stringify(plugin.defaultSettings ?? {})],
    );
    await ensureMenuForPlugin(plugin);
  }
  return manifests;
}

export async function listPlugins(db: Pool | PoolClient = pool): Promise<InstalledPlugin[]> {
  const manifests = await ensurePluginRows(db);
  const { rows } = await db.query<{ id: string; enabled: boolean; settings: Record<string, unknown> }>(
    `select id, enabled, settings from plugins order by id`,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const assembled = manifests.map((manifest) => {
    const row = byId.get(manifest.id);
    return {
      id: manifest.id,
      enabled: row?.enabled ?? manifest.defaultEnabled !== false,
      settings: row?.settings ?? manifest.defaultSettings ?? {},
      manifest,
    };
  });
  return assembled.map((plugin) => ({
    ...plugin,
    compatibility: assessPluginCompatibility(plugin, assembled),
  }));
}

export async function scanPlugins(
  db: Pool = pool,
): Promise<{ plugins: InstalledPlugin[]; added: string[]; incompatible: string[] }> {
  const { rows } = await db.query<{ id: string }>(`select id from plugins`);
  const before = new Set(rows.map((row) => row.id));
  let plugins = await listPlugins(db);
  const added = plugins.map((plugin) => plugin.id).filter((id) => !before.has(id));
  const incompatible: string[] = [];
  for (const plugin of plugins) {
    if (plugin.compatibility.ok) continue;
    incompatible.push(plugin.id);
    if (plugin.enabled && !plugin.manifest.required) {
      await db.query(`update plugins set enabled = false, updated_at = now() where id = $1`, [plugin.id]);
    }
  }
  if (incompatible.length > 0) plugins = await listPlugins(db);
  return { plugins, added, incompatible };
}

export async function isPluginEnabled(id: string, db: Pool | PoolClient = pool): Promise<boolean> {
  const manifest = await manifestById(id);
  if (!manifest) return false;
  const { rows } = await db.query<{ enabled: boolean }>(`select enabled from plugins where id = $1`, [id]);
  if (rows[0]) return rows[0].enabled;
  return manifest.defaultEnabled !== false;
}

export async function isPluginEffectivelyEnabled(id: string, db: Pool | PoolClient = pool): Promise<boolean> {
  const plugins = await listPlugins(db);
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const plugin = byId.get(id);
  if (!plugin) return false;
  return pluginSurfaceEnabled(plugin, byId);
}

/** Permission codes declared by enabled plugins whose dependencies are on. */
export async function enabledPluginPermissionCodes(db: Pool | PoolClient = pool): Promise<string[]> {
  const plugins = await listPlugins(db);
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const codes = new Set<string>();
  for (const plugin of plugins) {
    if (!pluginSurfaceEnabled(plugin, byId)) continue;
    for (const permission of plugin.manifest.permissions ?? []) codes.add(permission.code);
  }
  return [...codes];
}

export async function setPluginEnabled(
  id: string,
  enabled: boolean,
  db: Pool = pool,
): Promise<InstalledPlugin | { error: 'not_found' | 'required' | 'incompatible'; compatibility?: PluginCompatibility }> {
  const manifest = await manifestById(id);
  if (!manifest) return { error: 'not_found' };
  if (manifest.required && !enabled) return { error: 'required' };
  const list = await listPlugins(db);
  const current = list.find((plugin) => plugin.id === id);
  if (!current) return { error: 'not_found' };
  if (enabled && !current.compatibility.ok) {
    return { error: 'incompatible', compatibility: current.compatibility };
  }
  await db.query(`update plugins set enabled = $2, updated_at = now() where id = $1`, [id, enabled]);
  await doAction('plugin.enabled.changed', id, enabled);
  const after = await listPlugins(db);
  return after.find((plugin) => plugin.id === id)!;
}

export async function patchPluginSettings(
  id: string,
  settings: Record<string, unknown>,
  db: Pool = pool,
): Promise<InstalledPlugin | { error: 'not_found' }> {
  if (!(await manifestById(id))) return { error: 'not_found' };
  await ensurePluginRows(db);
  await db.query(
    `update plugins
        set settings = coalesce(settings, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
      where id = $1`,
    [id, JSON.stringify(settings)],
  );
  const list = await listPlugins(db);
  return list.find((plugin) => plugin.id === id)!;
}
