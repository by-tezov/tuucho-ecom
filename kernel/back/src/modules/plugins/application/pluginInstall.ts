import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { CORE_VERSION } from '../domain/coreVersion.js';
import { assessPluginCompatibility } from './pluginCompatibility.js';
import { resolvePluginDescription } from './discoverPlugins.js';
import {
  PluginArchiveError,
  extractPluginArchive,
  flattenArchiveRoot,
  type ArchiveFile,
} from './pluginArchive.js';
import {
  assertInstallPathAvailable,
  normalizePreferredInstallPath,
  resolveInstallDestination,
} from './pluginInstallPath.js';
import { listPlugins, scanPlugins, setPluginEnabled } from './pluginStore.js';
import type { PluginManifest } from '../domain/contracts.js';

const PLUGIN_ID_RE = /^[a-z0-9-]+$/;

export type InstalledArchive =
  | { ok: true; id: string; enabled: boolean }
  | { ok: false; error: string; message: string };

function parseManifest(files: ArchiveFile[]): PluginManifest {
  const manifestFile = files.find((file) => file.path === 'plugin.json');
  if (!manifestFile) throw new PluginArchiveError('missing_manifest', 'Archive has no plugin.json.');
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(manifestFile.data).toString('utf8'));
  } catch {
    throw new PluginArchiveError('invalid_manifest', 'plugin.json is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PluginArchiveError('invalid_manifest', 'plugin.json must be an object.');
  }
  const body = raw as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!PLUGIN_ID_RE.test(id)) {
    throw new PluginArchiveError('invalid_manifest', 'plugin.json id must match [a-z0-9-]+.');
  }
  if (!files.some((file) => file.path === 'back/register.ts' || file.path === 'back/register.js')) {
    throw new PluginArchiveError('invalid_manifest', 'Archive needs back/register.ts.');
  }
  const kind = (typeof body.kind === 'string' ? body.kind : 'generic') as PluginManifest['kind'];
  const description = resolvePluginDescription(id, kind, body.description);
  if (description === undefined) {
    throw new PluginArchiveError('invalid_manifest', 'plugin.json description is required.');
  }
  const installPath = normalizePreferredInstallPath(id, body.installPath);
  return {
    id,
    name: typeof body.name === 'string' ? body.name : id,
    version: typeof body.version === 'string' ? body.version : '1.0.0',
    kind,
    description,
    engines: body.engines && typeof body.engines === 'object' ? (body.engines as PluginManifest['engines']) : undefined,
    defaultEnabled: body.defaultEnabled !== false,
    installPath,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeFiles(root: string, files: ArchiveFile[]): Promise<void> {
  const resolvedRoot = resolve(root);
  for (const file of files) {
    const dest = resolve(join(resolvedRoot, file.path));
    if (dest !== resolvedRoot && !dest.startsWith(`${resolvedRoot}/`)) {
      throw new PluginArchiveError('zip_slip', `Path escape rejected: ${file.path}`);
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.data);
  }
}

export async function installPluginArchive(
  buffer: Uint8Array,
  filename: string,
): Promise<InstalledArchive> {
  try {
    const files = flattenArchiveRoot(await extractPluginArchive(buffer, filename));
    const manifest = parseManifest(files);
    const dest = resolveInstallDestination(manifest.id, manifest.installPath ?? '');
    const catalogue = await listPlugins();
    assertInstallPathAvailable({
      id: manifest.id,
      dest,
      destExists: await pathExists(dest),
      existing: catalogue,
    });
    const compatibility = assessPluginCompatibility(
      { id: manifest.id, manifest },
      catalogue.map((plugin) => ({ id: plugin.id, manifest: plugin.manifest })),
      CORE_VERSION,
    );
    if (!compatibility.ok) {
      return {
        ok: false,
        error: 'plugin_incompatible',
        message: compatibility.errors.map((entry) => entry.message).join(' '),
      };
    }
    await mkdir(dest, { recursive: true });
    await writeFiles(dest, files);
    await scanPlugins();
    const enabled = await setPluginEnabled(manifest.id, true);
    if ('error' in enabled) {
      return { ok: false, error: enabled.error, message: 'Installed on disk but could not enable.' };
    }
    return { ok: true, id: manifest.id, enabled: enabled.enabled };
  } catch (error) {
    if (error instanceof PluginArchiveError) {
      return { ok: false, error: error.code, message: error.message };
    }
    throw error;
  }
}
