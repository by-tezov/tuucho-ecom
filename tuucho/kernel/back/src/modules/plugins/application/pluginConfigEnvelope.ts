import type { JsonObject } from '../../../config/loadJsonConfig.js';
import { parseSemver, satisfiesRange } from '../domain/semverRange.js';
import type { PluginManifest } from '../domain/contracts.js';
import { classifyImportFile, splitSchemaKeys } from './pluginConfigFiles.js';
import type { ArchiveFile } from './pluginArchive.js';

export const PLUGIN_CONFIG_FORMAT = 1;
export const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{1,63}$/;

export type ConfigLayer = 'public' | 'private';

export type CompatBlockReason =
  | 'format'
  | 'compat_core'
  | 'compat_plugin'
  | 'path_mismatch'
  | 'layer_mismatch'
  | 'mixed_public'
  | 'invalid_json'
  | 'invalid_envelope';

export type PluginConfigEnvelope = {
  pluginId: string;
  layer: ConfigLayer;
  format: typeof PLUGIN_CONFIG_FORMAT;
  compat: { core: string; plugin: string };
  values: JsonObject;
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function caretRange(version: string): string {
  const parsed = parseSemver(version);
  if (!parsed) return `^${version}`;
  return `^${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function hasSettingsSchema(schema: PluginManifest['settingsSchema']): boolean {
  return Object.keys(schema ?? {}).length > 0;
}

export function layerFromFilename(name: string): ConfigLayer | null {
  const file = name.replaceAll('\\', '/').split('/').pop() ?? name;
  if (/config\.private(\.example)?\.json$/i.test(file) || /\.private\.json$/i.test(file)) {
    return 'private';
  }
  if (/config(\.example)?\.json$/i.test(file) || file.endsWith('.json')) return 'public';
  return null;
}

export function pathPluginId(path: string): string | null {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const id = parts[parts.length - 2] ?? '';
  return PLUGIN_ID_RE.test(id) ? id : null;
}

/** Strip a shared root folder when every remaining path still has a directory. */
export function stripSharedConfigPrefix(files: ArchiveFile[]): ArchiveFile[] {
  const prefixes = new Set(
    files.map((file) => file.path.split('/')[0]).filter((part): part is string => Boolean(part)),
  );
  if (prefixes.size !== 1) return files;
  const root = [...prefixes][0]!;
  const stripped = files
    .filter((file) => file.path.startsWith(`${root}/`) && file.path.length > root.length + 1)
    .map((file) => ({ path: file.path.slice(root.length + 1), data: file.data }));
  if (stripped.length === 0) return files;
  if (!stripped.every((file) => file.path.includes('/'))) return files;
  return stripped;
}

export function looksLikeEnvelope(body: JsonObject): boolean {
  return (
    'pluginId' in body ||
    'format' in body ||
    'compat' in body ||
    'values' in body ||
    'layer' in body
  );
}

export function parseEnvelope(body: JsonObject): PluginConfigEnvelope | { error: CompatBlockReason } {
  if (!looksLikeEnvelope(body)) return { error: 'invalid_envelope' };
  if (body.format !== PLUGIN_CONFIG_FORMAT) return { error: 'format' };
  const compat = isObject(body.compat) ? body.compat : null;
  if (
    typeof body.pluginId !== 'string' ||
    !PLUGIN_ID_RE.test(body.pluginId) ||
    (body.layer !== 'public' && body.layer !== 'private') ||
    !compat ||
    typeof compat.core !== 'string' ||
    typeof compat.plugin !== 'string' ||
    !isObject(body.values)
  ) {
    return { error: 'invalid_envelope' };
  }
  return {
    pluginId: body.pluginId,
    layer: body.layer,
    format: PLUGIN_CONFIG_FORMAT,
    compat: { core: compat.core, plugin: compat.plugin },
    values: body.values,
  };
}

export function buildEnvelope(
  pluginId: string,
  layer: ConfigLayer,
  values: JsonObject,
  enginesCore: string | undefined,
  pluginVersion: string,
): PluginConfigEnvelope {
  return {
    pluginId,
    layer,
    format: PLUGIN_CONFIG_FORMAT,
    compat: {
      core: enginesCore?.trim() || '*',
      plugin: caretRange(pluginVersion),
    },
    values,
  };
}

export function envelopeJson(envelope: PluginConfigEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function evaluateCompat(
  envelope: PluginConfigEnvelope,
  pluginVersion: string,
  coreVersion: string,
): CompatBlockReason | null {
  if (!satisfiesRange(coreVersion, envelope.compat.core)) return 'compat_core';
  if (!satisfiesRange(pluginVersion, envelope.compat.plugin)) return 'compat_plugin';
  return null;
}

export function pickSchemaValues(
  values: JsonObject,
  schema: PluginManifest['settingsSchema'],
  layer: ConfigLayer,
  pluginId: string,
  warnings: string[],
): { values: JsonObject } | { error: 'mixed_public' } {
  const classified = classifyImportFile(
    layer === 'private' ? 'config.private.json' : 'config.json',
    values,
    schema,
  );
  if ('error' in classified) return { error: 'mixed_public' };
  const picked = layer === 'private' ? classified.private : classified.public;
  const { publicKeys, secretKeys } = splitSchemaKeys(schema);
  const allowed = new Set(layer === 'private' ? secretKeys : publicKeys);
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) warnings.push(`${pluginId}: ignored unknown ${layer} key ${key}.`);
  }
  return { values: picked };
}
