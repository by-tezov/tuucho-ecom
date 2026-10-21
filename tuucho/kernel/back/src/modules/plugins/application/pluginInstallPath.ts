import { join, resolve } from 'node:path';
import { isTuuchoPluginId, isUserPluginId, repoRoot } from './discoverPlugins.js';
import { PluginArchiveError } from './pluginArchive.js';
import { userPluginRoots } from '../../../config/shopPaths.js';

/** Shop-relative tree for bundled first-party packages. */
export const TUUCHO_PLUGIN_TREE = 'tuucho/plugins';
/** Default shop-relative tree for user / uploaded packages. */
export const USER_PLUGIN_TREE = 'src/plugins';

const PLUGIN_ID_RE = /^[a-z0-9-]+$/;
const SEGMENT_RE = /^[a-z0-9._-]+$/;

export function preferredTreeForPluginId(id: string, root = repoRoot()): string {
  if (isTuuchoPluginId(id)) return TUUCHO_PLUGIN_TREE;
  if (isUserPluginId(id)) {
    const configured = userPluginRoots(root);
    if (configured[0]) {
      const rel = configured[0].startsWith(root) ? configured[0].slice(root.length).replace(/^[/\\]/, '') : USER_PLUGIN_TREE;
      return rel.replaceAll('\\', '/') || USER_PLUGIN_TREE;
    }
    return USER_PLUGIN_TREE;
  }
  throw new PluginArchiveError('invalid_manifest', 'tuucho.id must match [a-z0-9-]+.');
}

/** Repo-relative posix path of the package folder (leaf equals id). */
export function normalizePreferredInstallPath(id: string, raw: unknown, root = repoRoot()): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new PluginArchiveError(
      'invalid_manifest',
      'tuucho.installPath is required (repo-relative package folder).',
    );
  }
  const trimmed = raw.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!trimmed) {
    throw new PluginArchiveError('unsafe_path', `Unsafe installPath: ${raw}`);
  }
  if (trimmed.startsWith('/') || /^[a-zA-Z]:/.test(trimmed)) {
    throw new PluginArchiveError('unsafe_path', `Absolute installPath rejected: ${raw}`);
  }
  const parts: string[] = [];
  for (const part of trimmed.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      throw new PluginArchiveError('unsafe_path', `Path escape rejected: ${raw}`);
    }
    if (!SEGMENT_RE.test(part)) {
      throw new PluginArchiveError('unsafe_path', `Unsafe installPath segment: ${part}`);
    }
    parts.push(part);
  }
  if (parts.length < 2) {
    throw new PluginArchiveError('unsafe_path', `installPath must be under an allowed tree: ${raw}`);
  }
  const installPath = parts.join('/');
  const leaf = parts[parts.length - 1];
  if (!PLUGIN_ID_RE.test(id) || leaf !== id) {
    throw new PluginArchiveError('unsafe_path', `installPath leaf must equal plugin id "${id}".`);
  }
  if (isTuuchoPluginId(id)) {
    if (!installPath.startsWith(`${TUUCHO_PLUGIN_TREE}/`)) {
      throw new PluginArchiveError('unsafe_path', `Tuucho plugin ids must install under ${TUUCHO_PLUGIN_TREE}/.`);
    }
    const underTree = installPath.slice(`${TUUCHO_PLUGIN_TREE}/`.length);
    if (underTree === 'tuucho' || underTree.startsWith('tuucho/')) {
      throw new PluginArchiveError('unsafe_path', 'Forbidden extra tuucho segment under tuucho/plugins/.');
    }
    return installPath;
  }
  if (installPath === 'tuucho' || installPath.startsWith('tuucho/')) {
    throw new PluginArchiveError('unsafe_path', 'User plugin ids must not install under tuucho/.');
  }
  const tree = preferredTreeForPluginId(id, root);
  if (!installPath.startsWith(`${tree}/`)) {
    throw new PluginArchiveError('unsafe_path', `User plugin ids must install under ${tree}/.`);
  }
  return installPath;
}

export function resolveInstallDestination(id: string, installPath: string, root = repoRoot()): string {
  const normalized = normalizePreferredInstallPath(id, installPath, root);
  const tree = preferredTreeForPluginId(id, root);
  const treeRoot = resolve(join(root, tree));
  const dest = resolve(join(root, ...normalized.split('/')));
  if (dest === treeRoot || !dest.startsWith(`${treeRoot}/`)) {
    throw new PluginArchiveError('unsafe_path', `installPath escapes ${tree}/.`);
  }
  return dest;
}

function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function assertInstallPathAvailable(opts: {
  id: string;
  dest: string;
  destExists: boolean;
  existing: Array<{ id: string; sourceDir?: string; missingFromDisk?: boolean }>;
}): void {
  const { id, dest, destExists, existing } = opts;
  if (existing.some((plugin) => plugin.id === id && !plugin.missingFromDisk)) {
    throw new PluginArchiveError('already_installed', 'That plugin id is already on disk.');
  }
  if (destExists) {
    throw new PluginArchiveError('path_conflict', 'That installPath already exists on disk.');
  }
  const destResolved = resolve(dest);
  for (const plugin of existing) {
    if (!plugin.sourceDir || plugin.missingFromDisk) continue;
    const other = resolve(plugin.sourceDir);
    if (!pathsOverlap(destResolved, other)) continue;
    throw new PluginArchiveError(
      'path_conflict',
      plugin.id === id
        ? 'That plugin id is already on disk.'
        : `installPath overlaps plugin "${plugin.id}".`,
    );
  }
}
