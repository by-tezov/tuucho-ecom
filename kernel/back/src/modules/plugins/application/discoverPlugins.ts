import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginDependency, PluginKind, PluginManifest } from '../domain/contracts.js';
import { parseGithubHttpsRepo } from '../domain/githubRepository.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../../../');
const PLUGIN_DIRS = [join(REPO_ROOT, 'plugins/tuucho'), join(REPO_ROOT, 'plugins/user')];
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'coverage']);
const MAX_PLUGIN_DEPTH = 8;
const PLUGIN_ID_RE = /^[a-z0-9-]+$/;
/** Bundled first-party plugins must use this id prefix. User plugins must not. */
export const TUUCHO_PLUGIN_ID_PREFIX = 'tuucho-';
const KINDS = new Set<PluginKind>([
  'theme',
  'page',
  'payment',
  'shipping',
  'commerce',
  'docs',
  'generic',
  'seo',
  'locale',
]);

export function isTuuchoPluginId(id: string): boolean {
  return (
    id.startsWith(TUUCHO_PLUGIN_ID_PREFIX) &&
    id.length > TUUCHO_PLUGIN_ID_PREFIX.length &&
    PLUGIN_ID_RE.test(id)
  );
}

export function isUserPluginId(id: string): boolean {
  return PLUGIN_ID_RE.test(id) && !id.startsWith(TUUCHO_PLUGIN_ID_PREFIX);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Complements (`parent-locale-fr`) and standalone packs (`tuucho-locale-fr`). */
const LOCALE_PLUGIN_ID_RE = /^.+-locale-[a-z]{2}$/;

export function isLocalePluginId(id: string): boolean {
  return LOCALE_PLUGIN_ID_RE.test(id);
}

/** Real plugins must describe what they do. Locale packs may omit it. */
export function pluginRequiresDescription(id: string, kind: string): boolean {
  return kind !== 'locale' && !isLocalePluginId(id);
}

export function resolvePluginDescription(id: string, kind: string, raw: unknown): string | undefined {
  const description = asString(raw) ?? '';
  if (pluginRequiresDescription(id, kind) && !description) return undefined;
  return description;
}

function parseManifest(raw: unknown, folderId: string, sourceDir: string): PluginManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const id = asString(body.id) ?? folderId;
  if (id !== folderId || !PLUGIN_ID_RE.test(id)) return null;
  const kind = asString(body.kind);
  if (!kind || !KINDS.has(kind as PluginKind)) return null;
  const name = asString(body.name) ?? id;
  const version = asString(body.version) ?? '1.0.0';
  const description = resolvePluginDescription(id, kind, body.description);
  if (description === undefined) return null;
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
  let adminNav: PluginManifest['adminNav'];
  if (Array.isArray(body.adminNav)) {
    const items: NonNullable<PluginManifest['adminNav']> = [];
    for (const entry of body.adminNav) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const navId = asString(row.id);
      const group = asString(row.group);
      const to = asString(row.to);
      const permission = asString(row.permission);
      if (!navId || !group || !to || !permission) continue;
      const alsoActiveOn = Array.isArray(row.alsoActiveOn)
        ? row.alsoActiveOn.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
        : undefined;
      items.push({
        id: navId,
        group,
        to,
        permission,
        order: typeof row.order === 'number' ? row.order : undefined,
        label: asString(row.label),
        ...(alsoActiveOn && alsoActiveOn.length > 0 ? { alsoActiveOn } : {}),
      });
    }
    if (items.length > 0) adminNav = items;
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
    dependsOnMode: body.dependsOnMode === 'any' ? 'any' : 'all',
    engines: parseEngines(body.engines),
    route: asString(body.route),
    nav,
    courierCodes,
    defaultSettings,
    settingsSchema,
    permissions: parsePermissions(body.permissions),
    adminNav,
    sourceDir,
    installPath: parseInstallPath(body.installPath, id),
    repository: parseRepository(id, body.repository),
  };
}

function parseRepository(id: string, raw: unknown): string | undefined {
  if (isTuuchoPluginId(id)) return undefined;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return parseGithubHttpsRepo(raw)?.href;
}

function parseInstallPath(raw: unknown, id: string): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const trimmed = raw.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  const parts = trimmed.split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..') || parts[parts.length - 1] !== id) return undefined;
  return parts.join('/');
}

function parseDependsOn(raw: unknown): PluginManifest['dependsOn'] {
  if (!Array.isArray(raw)) return undefined;
  const deps: PluginDependency[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && PLUGIN_ID_RE.test(entry)) {
      deps.push(entry);
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const body = entry as Record<string, unknown>;
    const id = asString(body.id);
    if (!id || !PLUGIN_ID_RE.test(id)) continue;
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

function idAllowedInTree(scanRoot: string, id: string): boolean {
  const bundled = resolve(scanRoot) === resolve(PLUGIN_DIRS[0]);
  return bundled ? isTuuchoPluginId(id) : isUserPluginId(id);
}

async function collectFromDir(
  scanRoot: string,
  dir: string,
  depth: number,
  seen: Set<string>,
  manifests: PluginManifest[],
): Promise<void> {
  if (depth > MAX_PLUGIN_DEPTH) return;
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  if (names.includes('plugin.json')) {
    try {
      const folderId = basename(dir);
      const text = await readFile(join(dir, 'plugin.json'), 'utf8');
      const parsed = parseManifest(JSON.parse(text) as unknown, folderId, dir);
      if (parsed && idAllowedInTree(scanRoot, parsed.id) && !seen.has(parsed.id)) {
        seen.add(parsed.id);
        manifests.push(parsed);
      }
    } catch {
      // Missing or invalid manifest: skip this folder.
    }
    return;
  }
  for (const name of names) {
    if (name.startsWith('.') || SKIP_DIR_NAMES.has(name)) continue;
    const child = join(dir, name);
    try {
      if (!(await stat(child)).isDirectory()) continue;
    } catch {
      continue;
    }
    await collectFromDir(scanRoot, child, depth + 1, seen, manifests);
  }
}

/** Read every nested `plugin.json` under `plugins/tuucho` then `plugins/user`. */
export async function discoverDiskPlugins(): Promise<PluginManifest[]> {
  const manifests: PluginManifest[] = [];
  const seen = new Set<string>();
  for (const dir of PLUGIN_DIRS) {
    await collectFromDir(dir, dir, 0, seen, manifests);
  }
  return manifests.sort((a, b) => a.id.localeCompare(b.id));
}

/** Directory that holds plugin.json. Falls back to a one-level bundled path. */
export function pluginPackageDir(manifest: Pick<PluginManifest, 'id' | 'sourceDir'>): string {
  if (manifest.sourceDir) return manifest.sourceDir;
  return join(pluginsDirectory(), manifest.id);
}

export function pluginsDirectory(): string {
  return PLUGIN_DIRS[0];
}

export function pluginSearchDirectories(): string[] {
  return [...PLUGIN_DIRS];
}

export function repoRoot(): string {
  return REPO_ROOT;
}
