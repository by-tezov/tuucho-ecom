import type { Pool, PoolClient } from 'pg';
import { pool } from '../../../db/pool.js';
import { CORE_VERSION, readRootPackageVersion } from '../../../config/appVersion.js';
import { loadManifests, manifestById } from './catalog.js';
import { doAction } from './hooks.js';
import { ensureMenuForPlugin } from './storeSettings.js';
import { pluginSurfaceEnabled } from './pluginSurface.js';
import { assessPluginCompatibility, type PluginCompatibility } from './pluginCompatibility.js';
import { applyPluginMigrations, revertPluginMigrations } from './pluginSchema.js';
import { flushPluginCache } from '@tuucho/plugin-sdk';
import type { PluginManifest } from '../domain/contracts.js';
import {
  pluginSecretsNeedSeal,
  sealPluginSecrets,
  unsealPluginSecrets,
} from './pluginSecretsCrypto.js';

export { pluginSurfaceEnabled } from './pluginSurface.js';

const settingsCache = new Map<string, Record<string, unknown>>();
const secretsCache = new Map<string, Record<string, unknown>>();
const enabledCache = new Map<string, boolean>();

function rememberPluginDocuments(
  id: string,
  settings: Record<string, unknown> | undefined,
  secrets: Record<string, unknown> | undefined,
): void {
  settingsCache.set(id, settings ?? {});
  secretsCache.set(id, secrets ?? {});
}

export function getCachedPluginSettings(id: string): Record<string, unknown> {
  return settingsCache.get(id) ?? {};
}

export function getCachedPluginSecret(id: string, key: string): string | undefined {
  const value = secretsCache.get(id)?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function isCachedPluginEnabled(id: string): boolean {
  return enabledCache.get(id) === true;
}

export function secretKeysPresent(id: string): string[] {
  return Object.entries(secretsCache.get(id) ?? {})
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key]) => key);
}

export interface InstalledPlugin {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  schemaVersion: string | null;
  missingFromDisk: boolean;
  manifest: PluginManifest;
  compatibility: PluginCompatibility;
}

export { CORE_VERSION, readRootPackageVersion };

export async function ensurePluginRows(db: Pool | PoolClient = pool): Promise<PluginManifest[]> {
  const manifests = await loadManifests();
  for (const plugin of manifests) {
    const seedEnabled = plugin.defaultEnabled !== false;
    await db.query(
      `insert into plugins (id, enabled, settings)
       values ($1, $2, $3::jsonb)
       on conflict (id) do update
         set settings = $3::jsonb || coalesce(plugins.settings, '{}'::jsonb)`,
      [plugin.id, seedEnabled, JSON.stringify(plugin.defaultSettings ?? {})],
    );
    await ensureMenuForPlugin(plugin);
  }
  return manifests;
}

async function persistSealedSecrets(
  id: string,
  secrets: Record<string, string>,
  db: Pool | PoolClient,
): Promise<void> {
  if (Object.keys(secrets).length === 0) {
    await db.query(`update plugins set secrets = '{}'::jsonb, updated_at = now() where id = $1`, [id]);
    return;
  }
  await db.query(
    `update plugins
        set secrets = to_jsonb($2::text), updated_at = now()
      where id = $1`,
    [id, sealPluginSecrets(secrets)],
  );
}

async function migratePlaintextSecrets(
  rows: Array<{ id: string; secrets: unknown }>,
  db: Pool | PoolClient,
): Promise<void> {
  for (const row of rows) {
    if (!pluginSecretsNeedSeal(row.secrets)) continue;
    const map = unsealPluginSecrets(row.secrets);
    const result = await db.query(
      `update plugins
          set secrets = to_jsonb($2::text), updated_at = now()
        where id = $1
          and jsonb_typeof(secrets) = 'object'
          and secrets <> '{}'::jsonb`,
      [row.id, sealPluginSecrets(map)],
    );
    if ((result.rowCount ?? 0) > 0) {
      console.info(
        `[plugins] sealed leftover plaintext secrets at rest for ${row.id} (${Object.keys(map).length} keys).`,
      );
    }
  }
}

function missingDiskManifest(id: string, schemaVersion: string | null): PluginManifest {
  return {
    id,
    name: id,
    version: schemaVersion ?? '0.0.0',
    kind: 'generic',
    description: 'Folder missing from disk.',
    required: false,
    defaultEnabled: false,
  };
}

export async function listPlugins(db: Pool | PoolClient = pool): Promise<InstalledPlugin[]> {
  const manifests = await ensurePluginRows(db);
  let rows: Array<{
    id: string;
    enabled: boolean;
    settings: Record<string, unknown>;
    secrets: unknown;
    schema_version: string | null;
  }>;
  try {
    ({ rows } = await db.query(
      `select id, enabled, settings, secrets, schema_version from plugins order by id`,
    ));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== '42703') throw error;
    ({ rows } = await db.query(
      `select id, enabled, settings, '{}'::jsonb as secrets, schema_version from plugins order by id`,
    ));
  }
  await migratePlaintextSecrets(rows, db);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) rememberPluginDocuments(row.id, row.settings, unsealPluginSecrets(row.secrets));
  const assembled: Array<Omit<InstalledPlugin, 'compatibility'>> = manifests.map((manifest) => {
    const row = byId.get(manifest.id);
    return {
      id: manifest.id,
      enabled: row?.enabled ?? manifest.defaultEnabled !== false,
      settings: row?.settings ?? manifest.defaultSettings ?? {},
      schemaVersion: row?.schema_version ?? null,
      missingFromDisk: false,
      manifest,
    };
  });
  const diskIds = new Set(manifests.map((manifest) => manifest.id));
  for (const row of rows) {
    if (diskIds.has(row.id)) continue;
    assembled.push({
      id: row.id,
      enabled: false,
      settings: row.settings ?? {},
      schemaVersion: row.schema_version,
      missingFromDisk: true,
      manifest: missingDiskManifest(row.id, row.schema_version),
    });
  }
  const listed: InstalledPlugin[] = assembled.map((plugin) => ({
    ...plugin,
    compatibility: plugin.missingFromDisk
      ? {
          ok: false,
          errors: [
            {
              code: 'missing_from_disk',
              message: 'Plugin folder is gone. Uninstall to drop its tables, or restore the folder first.',
            },
          ],
        }
      : assessPluginCompatibility(plugin, assembled),
  }));
  const enablement = new Map(listed.map((plugin) => [plugin.id, plugin]));
  enabledCache.clear();
  for (const plugin of listed) {
    enabledCache.set(
      plugin.id,
      pluginSurfaceEnabled(plugin, enablement) && plugin.compatibility.ok && !plugin.missingFromDisk,
    );
  }
  return listed;
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
  for (const plugin of plugins) {
    if (!plugin.enabled || plugin.missingFromDisk || !plugin.compatibility.ok) continue;
    await applyPluginMigrations(plugin.manifest, db);
  }
  if (added.length > 0) plugins = await listPlugins(db);
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
  if (enabled) await applyPluginMigrations(manifest, db);
  await db.query(`update plugins set enabled = $2, updated_at = now() where id = $1`, [id, enabled]);
  await doAction('plugin.enabled.changed', id, enabled);
  const { reloadPluginRuntime } = await import('./loadPluginRuntime.js');
  await reloadPluginRuntime();
  const after = await listPlugins(db);
  return after.find((plugin) => plugin.id === id)!;
}

export async function uninstallPlugin(
  id: string,
  confirm: boolean,
  db: Pool = pool,
): Promise<{ ok: true; reverted: string[] } | { error: 'not_found' | 'required' | 'unconfirmed' }> {
  if (!confirm) return { error: 'unconfirmed' };
  const { rows } = await db.query<{ id: string }>(`select id from plugins where id = $1`, [id]);
  if (!rows[0]) return { error: 'not_found' };
  const manifest = await manifestById(id);
  if (manifest?.required) return { error: 'required' };
  const { reverted } = await revertPluginMigrations(id, manifest, db);
  flushPluginCache(id);
  await doAction('plugin.enabled.changed', id, false);
  const { reloadPluginRuntime } = await import('./loadPluginRuntime.js');
  await reloadPluginRuntime();
  return { ok: true, reverted };
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

export async function patchPluginSecrets(
  id: string,
  secrets: Record<string, unknown>,
  db: Pool = pool,
): Promise<InstalledPlugin | { error: 'not_found' }> {
  if (!(await manifestById(id))) return { error: 'not_found' };
  await ensurePluginRows(db);
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    cleaned[key] = value;
  }
  if (Object.keys(cleaned).length > 0) {
    const { rows } = await db.query<{ secrets: unknown }>(`select secrets from plugins where id = $1`, [id]);
    await persistSealedSecrets(id, { ...unsealPluginSecrets(rows[0]?.secrets), ...cleaned }, db);
  }
  const list = await listPlugins(db);
  return list.find((plugin) => plugin.id === id)!;
}
