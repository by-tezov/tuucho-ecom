/**
 * Operator JSON for plugin settings/secrets. Runtime source of truth stays
 * the DB. Files seed once, then Admin Configure or explicit import/apply.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { deepMerge, resolveAppTarget, type JsonObject } from '../../../config/loadJsonConfig.js';
import { resolveConfigPaths } from '../../../config/configTreePaths.js';
import { configRoot, shopRoot } from '../../../config/shopPaths.js';
import type { PluginManifest, PluginSettingField } from '../domain/contracts.js';
import { isTuuchoPluginId } from './discoverPlugins.js';

export type PluginConfigFilesView = {
  present: boolean;
  hash: string | null;
  appliedHash: string | null;
  differ: boolean;
  paths: string[];
};

export type LoadedPluginConfig = {
  present: boolean;
  public: JsonObject;
  private: JsonObject;
  hash: string | null;
  paths: string[];
  warnings: string[];
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFile(path: string): JsonObject {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isObject(parsed)) throw new Error(`${path} must be a JSON object.`);
  return parsed;
}

function loadOptionalJson(path: string, warnings: string[], pluginId: string): JsonObject {
  if (!existsSync(path)) return {};
  try {
    return readJsonFile(path);
  } catch (error) {
    warnings.push(
      `${pluginId}: invalid JSON in ${shopRelative(path)} (${error instanceof Error ? error.message : String(error)}).`,
    );
    return {};
  }
}

function loadPrivateLayer(
  file: string,
  example: string,
  warnings: string[],
  pluginId: string,
): JsonObject {
  if (existsSync(file)) return loadOptionalJson(file, warnings, pluginId);
  if (existsSync(example)) {
    const obj = loadOptionalJson(example, warnings, pluginId);
    if (Object.keys(obj).length === 0) return {};
    warnings.push(`${pluginId}: ${shopRelative(file)} is missing; loading ${shopRelative(example)}.`);
    return obj;
  }
  return {};
}

export function shopRelative(path: string): string {
  const rel = relative(shopRoot, path).replaceAll('\\', '/');
  return rel.startsWith('..') ? path : rel;
}

function containedIn(child: string, parent: string): boolean {
  const resolvedChild = resolve(child);
  const resolvedParent = resolve(parent);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + sep);
}

/** Directory that holds config.json for this plugin, or null if disallowed. */
export function resolvePluginConfigDir(manifest: PluginManifest): string | null {
  const id = manifest.id;
  const bundled = join(configRoot, 'plugins', id);
  if (isTuuchoPluginId(id)) return bundled;
  const packageDir = manifest.sourceDir;
  if (!packageDir) return null;
  const raw = manifest.configDir?.trim();
  if (!raw) return packageDir;
  if (raw.includes('\0') || raw.split(/[/\\]/).includes('..')) return null;
  const posix = raw.replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (posix.startsWith('tuucho-config/')) {
    const resolved = resolve(shopRoot, posix);
    if (!containedIn(resolved, join(configRoot, 'plugins')) && resolved !== bundled) return null;
    return resolved;
  }
  const resolved = resolve(packageDir, posix);
  if (!containedIn(resolved, packageDir)) return null;
  if (containedIn(resolved, join(shopRoot, 'tuucho')) && !containedIn(resolved, join(shopRoot, 'src'))) {
    return null;
  }
  return resolved;
}

export function splitSchemaKeys(schema: Record<string, PluginSettingField> | undefined): {
  publicKeys: string[];
  secretKeys: string[];
} {
  const publicKeys: string[] = [];
  const secretKeys: string[] = [];
  for (const [key, field] of Object.entries(schema ?? {})) {
    if (field?.type === 'secret') secretKeys.push(key);
    else publicKeys.push(key);
  }
  return { publicKeys, secretKeys };
}

function sortKeys(obj: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}

export function canonicalPluginConfigHash(publicObj: JsonObject, privateObj: JsonObject): string {
  const payload = JSON.stringify({ public: sortKeys(publicObj), private: sortKeys(privateObj) });
  return createHash('sha256').update(payload).digest('hex');
}

function pickKnown(
  raw: JsonObject,
  allowed: Set<string>,
  pluginId: string,
  layer: 'public' | 'private',
  warnings: string[],
): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) {
      warnings.push(`${pluginId}: ignored unknown ${layer} key ${key}.`);
      continue;
    }
    if (layer === 'private' && (typeof value !== 'string' || value.trim() === '')) continue;
    out[key] = value;
  }
  return out;
}

export function loadPluginConfigFiles(manifest: PluginManifest): LoadedPluginConfig {
  const warnings: string[] = [];
  const dir = resolvePluginConfigDir(manifest);
  const empty: LoadedPluginConfig = {
    present: false,
    public: {},
    private: {},
    hash: null,
    paths: [],
    warnings,
  };
  if (!dir) return empty;
  let target: string;
  try {
    target = resolveAppTarget(process.env.APP_TARGET);
  } catch {
    target = 'dev';
  }
  const resolved = resolveConfigPaths(dir, target, { includeRole: false, warnIfUndeclared: false });
  for (const warning of resolved.warnings) warnings.push(`${manifest.id}: ${warning}`);
  const paths = {
    commonPublic: resolved.commonPublic,
    envPublic: resolved.envPublic,
    commonPrivate: resolved.commonPrivate,
    commonPrivateExample: resolved.commonPrivateExample,
    envPrivate: resolved.envPrivate,
    envPrivateExample: resolved.envPrivateExample,
  };
  const presentFiles = [
    paths.commonPublic,
    paths.envPublic,
    paths.commonPrivate,
    paths.commonPrivateExample,
    paths.envPrivate,
    paths.envPrivateExample,
  ].filter((path) => existsSync(path));
  if (presentFiles.length === 0) return empty;
  const { publicKeys, secretKeys } = splitSchemaKeys(manifest.settingsSchema);
  const publicAllowed = new Set(publicKeys);
  const secretAllowed = new Set(secretKeys);
  const publicMerged = deepMerge(
    pickKnown(loadOptionalJson(paths.commonPublic, warnings, manifest.id), publicAllowed, manifest.id, 'public', warnings),
    pickKnown(loadOptionalJson(paths.envPublic, warnings, manifest.id), publicAllowed, manifest.id, 'public', warnings),
  );
  const privateMerged = deepMerge(
    pickKnown(
      loadPrivateLayer(paths.commonPrivate, paths.commonPrivateExample, warnings, manifest.id),
      secretAllowed,
      manifest.id,
      'private',
      warnings,
    ),
    pickKnown(
      loadPrivateLayer(paths.envPrivate, paths.envPrivateExample, warnings, manifest.id),
      secretAllowed,
      manifest.id,
      'private',
      warnings,
    ),
  );
  if (secretKeys.length > 0 && Object.keys(privateMerged).length === 0 && !existsSync(paths.commonPrivate) && !existsSync(paths.commonPrivateExample)) {
    warnings.push(`${manifest.id}: no secrets file.`);
  }
  const listed = [
    paths.commonPublic,
    paths.envPublic,
    existsSync(paths.commonPrivate) ? paths.commonPrivate : paths.commonPrivateExample,
    existsSync(paths.envPrivate) ? paths.envPrivate : paths.envPrivateExample,
  ].filter((path) => existsSync(path));
  return {
    present: true,
    public: publicMerged,
    private: privateMerged,
    hash: canonicalPluginConfigHash(publicMerged, privateMerged),
    paths: listed.map(shopRelative),
    warnings,
  };
}

export function pluginPublicSettingsUnset(
  settings: Record<string, unknown>,
  defaults: Record<string, unknown> | undefined,
  publicKeys: string[],
): boolean {
  const seed = defaults ?? {};
  for (const key of publicKeys) {
    const actual = settings[key];
    if (actual === undefined || actual === '') continue;
    if (JSON.stringify(actual) === JSON.stringify(seed[key])) continue;
    return false;
  }
  return true;
}

export function pluginSecretsUnset(secrets: Record<string, unknown>): boolean {
  return Object.values(secrets).every((value) => typeof value !== 'string' || value.trim() === '');
}

export function classifyImportFile(
  name: string,
  body: JsonObject,
  schema: Record<string, PluginSettingField> | undefined,
): { public: JsonObject; private: JsonObject } | { error: 'mixed_public' } {
  const { publicKeys, secretKeys } = splitSchemaKeys(schema);
  const publicSet = new Set(publicKeys);
  const secretSet = new Set(secretKeys);
  const file = name.replaceAll('\\', '/').split('/').pop() ?? name;
  const asPrivate = /config\.private(\.example)?\.json$/i.test(file) || /\.private\.json$/i.test(file);
  if (asPrivate) {
    const privateObj: JsonObject = {};
    for (const [key, value] of Object.entries(body)) {
      if (secretSet.has(key)) privateObj[key] = value;
    }
    return { public: {}, private: privateObj };
  }
  const asPublic = /config(\.example)?\.json$/i.test(file) || file.endsWith('.json');
  if (asPublic) {
    for (const key of Object.keys(body)) {
      if (secretSet.has(key)) return { error: 'mixed_public' };
    }
    const publicObj: JsonObject = {};
    for (const [key, value] of Object.entries(body)) {
      if (publicSet.has(key)) publicObj[key] = value;
    }
    return { public: publicObj, private: {} };
  }
  return { public: {}, private: {} };
}

export function examplePublicFromSchema(manifest: PluginManifest): JsonObject {
  const { publicKeys } = splitSchemaKeys(manifest.settingsSchema);
  const defaults = manifest.defaultSettings ?? {};
  const out: JsonObject = {};
  for (const key of publicKeys) {
    if (defaults[key] !== undefined) out[key] = defaults[key] as never;
    else {
      const type = manifest.settingsSchema?.[key]?.type;
      out[key] = type === 'boolean' ? false : type === 'number' ? 0 : '';
    }
  }
  return sortKeys(out);
}

export function examplePrivateFromSchema(manifest: PluginManifest): JsonObject {
  const { secretKeys } = splitSchemaKeys(manifest.settingsSchema);
  const out: JsonObject = {};
  for (const key of secretKeys) out[key] = 'replace-me';
  return sortKeys(out);
}

export function pluginConfigFilesView(
  manifest: PluginManifest,
  appliedHash: string | null,
): PluginConfigFilesView {
  const loaded = loadPluginConfigFiles(manifest);
  const differ =
    loaded.present &&
    loaded.hash !== null &&
    appliedHash !== null &&
    appliedHash !== loaded.hash;
  return {
    present: loaded.present,
    hash: loaded.hash,
    appliedHash,
    differ,
    paths: loaded.paths,
  };
}
