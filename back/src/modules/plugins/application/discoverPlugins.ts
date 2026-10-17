import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginDependency, PluginKind, PluginManifest } from '../domain/contracts.js';

const PLUGINS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../plugins');
const KINDS = new Set<PluginKind>(['theme', 'page', 'payment', 'shipping', 'commerce', 'docs', 'generic']);

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseManifest(raw: unknown, folderId: string): PluginManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const id = asString(body.id) ?? folderId;
  if (id !== folderId || !/^[a-z0-9-]+$/.test(id)) return null;
  const kind = asString(body.kind);
  if (!kind || !KINDS.has(kind as PluginKind)) return null;
  const name = asString(body.name) ?? id;
  const version = asString(body.version) ?? '1.0.0';
  const description = asString(body.description) ?? '';
  const navRaw = body.nav;
  let nav: PluginManifest['nav'];
  if (navRaw && typeof navRaw === 'object' && !Array.isArray(navRaw)) {
    const navBody = navRaw as Record<string, unknown>;
    const key = asString(navBody.key);
    const order = typeof navBody.order === 'number' ? navBody.order : undefined;
    if (key && order !== undefined) {
      nav = { key, order, bottomBar: navBody.bottomBar === true };
    }
  }
  const courierCodes = Array.isArray(body.courierCodes)
    ? body.courierCodes.filter((code): code is string => typeof code === 'string')
    : undefined;
  const defaultSettings =
    body.defaultSettings && typeof body.defaultSettings === 'object' && !Array.isArray(body.defaultSettings)
      ? (body.defaultSettings as Record<string, unknown>)
      : undefined;
  let settingsSchema: PluginManifest['settingsSchema'];
  if (body.settingsSchema && typeof body.settingsSchema === 'object' && !Array.isArray(body.settingsSchema)) {
    const schema: NonNullable<PluginManifest['settingsSchema']> = {};
    for (const [key, spec] of Object.entries(body.settingsSchema as Record<string, unknown>)) {
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;
      const field = spec as Record<string, unknown>;
      const type = asString(field.type);
      if (type !== 'string' && type !== 'text' && type !== 'number' && type !== 'boolean') continue;
      schema[key] = { type, label: asString(field.label) };
    }
    if (Object.keys(schema).length > 0) settingsSchema = schema;
  }
  return {
    id,
    name,
    version,
    kind: kind as PluginKind,
    description,
    required: body.required === true,
    defaultEnabled: body.defaultEnabled !== false,
    provides: Array.isArray(body.provides)
      ? body.provides.filter((item): item is string => typeof item === 'string')
      : undefined,
    dependsOn: parseDependsOn(body.dependsOn),
    engines: parseEngines(body.engines),
    route: asString(body.route),
    nav,
    courierCodes,
    defaultSettings,
    settingsSchema,
    permissions: parsePermissions(body.permissions),
  };
}

function parseDependsOn(raw: unknown): PluginManifest['dependsOn'] {
  if (!Array.isArray(raw)) return undefined;
  const deps: PluginDependency[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && /^[a-z0-9-]+$/.test(entry)) {
      deps.push(entry);
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const body = entry as Record<string, unknown>;
    const id = asString(body.id);
    if (!id || !/^[a-z0-9-]+$/.test(id)) continue;
    const version = asString(body.version);
    deps.push(version ? { id, version } : { id });
  }
  return deps.length > 0 ? deps : undefined;
}

function parseEngines(raw: unknown): PluginManifest['engines'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const core = asString((raw as Record<string, unknown>).core);
  return core ? { core } : undefined;
}

function parsePermissions(raw: unknown): PluginManifest['permissions'] {
  if (!Array.isArray(raw)) return undefined;
  const permissions: NonNullable<PluginManifest['permissions']> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const body = entry as Record<string, unknown>;
    const code = asString(body.code);
    const label = asString(body.label);
    if (!code || !label || !/^[a-z][a-z0-9_]{1,63}$/.test(code)) continue;
    permissions.push({ code, label });
  }
  return permissions.length > 0 ? permissions : undefined;
}

/** Read every `back/plugins/<id>/plugin.json`. Folder name is the plugin id. */
export async function discoverDiskPlugins(): Promise<PluginManifest[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(PLUGINS_DIR);
  } catch {
    return [];
  }
  const manifests: PluginManifest[] = [];
  for (const folderId of entries) {
    if (folderId.startsWith('.')) continue;
    try {
      const text = await readFile(join(PLUGINS_DIR, folderId, 'plugin.json'), 'utf8');
      const parsed = parseManifest(JSON.parse(text) as unknown, folderId);
      if (parsed) manifests.push(parsed);
    } catch {
      // Missing or invalid manifest: skip this folder.
    }
  }
  return manifests.sort((a, b) => a.id.localeCompare(b.id));
}

export function pluginsDirectory(): string {
  return PLUGINS_DIR;
}
