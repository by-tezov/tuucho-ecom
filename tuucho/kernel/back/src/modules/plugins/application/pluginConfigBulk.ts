import type { JsonObject } from '../../../config/loadJsonConfig.js';
import { CORE_VERSION } from '../../../config/appVersion.js';
import {
  applyPluginConfigFromDisk,
  writePluginConfigToDb,
} from './pluginConfigApply.js';
import {
  PluginArchiveError,
  buildStoredZip,
  extractPluginArchive,
  type ArchiveFile,
} from './pluginArchive.js';
import {
  canonicalPluginConfigHash,
  loadPluginConfigFiles,
  splitSchemaKeys,
} from './pluginConfigFiles.js';
import {
  buildEnvelope,
  envelopeJson,
  evaluateCompat,
  hasSettingsSchema,
  layerFromFilename,
  parseEnvelope,
  pathPluginId,
  pickSchemaValues,
  stripSharedConfigPrefix,
  type CompatBlockReason,
  type ConfigLayer,
  type PluginConfigEnvelope,
} from './pluginConfigEnvelope.js';
import { getCachedPluginSecrets, type InstalledPlugin } from './pluginStore.js';

export type BulkSkipReason = 'disabled' | 'no_schema' | 'no_files' | 'unknown_plugin';
export type BulkItem = { id: string; reason: BulkSkipReason | CompatBlockReason };

export type BulkReport = {
  applied: string[];
  skipped: BulkItem[];
  blocked: BulkItem[];
  warnings: string[];
};

function emptyReport(): BulkReport {
  return { applied: [], skipped: [], blocked: [], warnings: [] };
}

function parseJsonBytes(data: Uint8Array): JsonObject | { error: 'invalid_json' } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(data).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'invalid_json' };
    }
    return parsed as JsonObject;
  } catch {
    return { error: 'invalid_json' };
  }
}

export function exportLayersForPlugin(plugin: InstalledPlugin): Array<{
  path: string;
  envelope: PluginConfigEnvelope;
}> {
  const { publicKeys, secretKeys } = splitSchemaKeys(plugin.manifest.settingsSchema);
  const publicOut: JsonObject = {};
  for (const key of publicKeys) {
    if (plugin.settings[key] !== undefined) publicOut[key] = plugin.settings[key] as never;
  }
  const stored = getCachedPluginSecrets(plugin.id);
  const privateOut: JsonObject = {};
  for (const key of secretKeys) {
    const value = stored[key];
    if (typeof value === 'string' && value.trim()) privateOut[key] = value;
  }
  const out: Array<{ path: string; envelope: PluginConfigEnvelope }> = [];
  if (Object.keys(publicOut).length > 0) {
    out.push({
      path: `${plugin.id}/config.json`,
      envelope: buildEnvelope(
        plugin.id,
        'public',
        publicOut,
        plugin.manifest.engines?.core,
        plugin.manifest.version,
      ),
    });
  }
  if (Object.keys(privateOut).length > 0) {
    out.push({
      path: `${plugin.id}/config.private.json`,
      envelope: buildEnvelope(
        plugin.id,
        'private',
        privateOut,
        plugin.manifest.engines?.core,
        plugin.manifest.version,
      ),
    });
  }
  return out;
}

export function zipConfigEntries(
  entries: Array<{ path: string; envelope: PluginConfigEnvelope }>,
): Uint8Array {
  return buildStoredZip(
    entries.map((entry) => ({
      path: entry.path,
      data: Buffer.from(envelopeJson(entry.envelope), 'utf8'),
    })),
  );
}

export type LayerBag = { public?: JsonObject; private?: JsonObject; envelope?: PluginConfigEnvelope };

function ingestMember(
  path: string,
  body: JsonObject,
  expectedId: string | undefined,
  plugins: Map<string, InstalledPlugin>,
  bags: Map<string, LayerBag>,
  report: BulkReport,
): void {
  const filenameLayer = layerFromFilename(path);
  if (!filenameLayer) return;
  const pathId = pathPluginId(path);
  const parsed = looksLikeEnvelopeSafe(body) ? parseEnvelope(body) : null;
  let pluginId = pathId;
  let layer: ConfigLayer = filenameLayer;
  let values = body;
  let envelope: PluginConfigEnvelope | undefined;
  if (parsed && 'error' in parsed) {
    report.blocked.push({ id: pathId ?? expectedId ?? 'unknown', reason: parsed.error });
    return;
  }
  if (parsed) {
    envelope = parsed;
    pluginId = parsed.pluginId;
    layer = parsed.layer;
    values = parsed.values;
    if (pathId && pathId !== parsed.pluginId) {
      report.blocked.push({ id: parsed.pluginId, reason: 'path_mismatch' });
      return;
    }
    if (filenameLayer !== parsed.layer) {
      report.blocked.push({ id: parsed.pluginId, reason: 'layer_mismatch' });
      return;
    }
  }
  if (!pluginId) pluginId = expectedId ?? null;
  if (!pluginId) {
    report.skipped.push({ id: 'unknown', reason: 'unknown_plugin' });
    return;
  }
  if (expectedId && pluginId !== expectedId) {
    report.blocked.push({ id: pluginId, reason: 'path_mismatch' });
    return;
  }
  const plugin = plugins.get(pluginId);
  if (!plugin) {
    report.skipped.push({ id: pluginId, reason: 'unknown_plugin' });
    return;
  }
  if (!hasSettingsSchema(plugin.manifest.settingsSchema)) {
    report.skipped.push({ id: pluginId, reason: 'no_schema' });
    return;
  }
  if (envelope) {
    const compat = evaluateCompat(envelope, plugin.manifest.version, CORE_VERSION);
    if (compat) {
      report.blocked.push({ id: pluginId, reason: compat });
      return;
    }
  }
  const picked = pickSchemaValues(
    values,
    plugin.manifest.settingsSchema,
    layer,
    pluginId,
    report.warnings,
  );
  if ('error' in picked) {
    report.blocked.push({ id: pluginId, reason: 'mixed_public' });
    return;
  }
  const bag = bags.get(pluginId) ?? {};
  if (layer === 'public') bag.public = { ...(bag.public ?? {}), ...picked.values };
  else bag.private = { ...(bag.private ?? {}), ...picked.values };
  if (envelope) bag.envelope = envelope;
  bags.set(pluginId, bag);
}

function looksLikeEnvelopeSafe(body: JsonObject): boolean {
  return (
    'pluginId' in body ||
    'format' in body ||
    'compat' in body ||
    'values' in body ||
    'layer' in body
  );
}

export async function writeBags(
  bags: Map<string, LayerBag>,
  plugins: Map<string, InstalledPlugin>,
  report: BulkReport,
): Promise<void> {
  const blocked = new Set(report.blocked.map((item) => item.id));
  for (const [id, bag] of bags) {
    if (blocked.has(id)) continue;
    const plugin = plugins.get(id);
    if (!plugin) continue;
    const publicObj = bag.public ?? {};
    const privateObj = bag.private ?? {};
    const hash = canonicalPluginConfigHash(publicObj, privateObj);
    await writePluginConfigToDb(plugin, publicObj, privateObj, hash);
    report.applied.push(id);
  }
}

export async function applyAllPluginConfigFromDisk(
  plugins: InstalledPlugin[],
): Promise<BulkReport> {
  const report = emptyReport();
  for (const plugin of plugins) {
    if (!hasSettingsSchema(plugin.manifest.settingsSchema)) continue;
    if (!plugin.enabled) {
      report.skipped.push({ id: plugin.id, reason: 'disabled' });
      continue;
    }
    const loaded = loadPluginConfigFiles(plugin.manifest);
    if (!loaded.present) {
      report.skipped.push({ id: plugin.id, reason: 'no_files' });
      continue;
    }
    const result = await applyPluginConfigFromDisk(plugin);
    if (!result.ok) {
      report.skipped.push({ id: plugin.id, reason: 'no_files' });
      continue;
    }
    report.warnings.push(...result.warnings);
    report.applied.push(plugin.id);
  }
  return report;
}

export function exportAllPluginConfigZip(plugins: InstalledPlugin[]): Uint8Array | null {
  const entries: Array<{ path: string; envelope: PluginConfigEnvelope }> = [];
  for (const plugin of plugins) {
    if (!plugin.enabled || !hasSettingsSchema(plugin.manifest.settingsSchema)) continue;
    entries.push(...exportLayersForPlugin(plugin));
  }
  if (entries.length === 0) return null;
  return zipConfigEntries(entries);
}

export function planPluginConfigImport(
  files: ArchiveFile[],
  installed: InstalledPlugin[],
  expectedId?: string,
): { report: BulkReport; bags: Map<string, LayerBag>; plugins: Map<string, InstalledPlugin> } {
  const report = emptyReport();
  const plugins = new Map(installed.map((plugin) => [plugin.id, plugin]));
  const bags = new Map<string, LayerBag>();
  const members = stripSharedConfigPrefix(files);
  for (const file of members) {
    const body = parseJsonBytes(file.data);
    if ('error' in body) {
      report.blocked.push({
        id: pathPluginId(file.path) ?? expectedId ?? 'unknown',
        reason: 'invalid_json',
      });
      continue;
    }
    ingestMember(file.path, body, expectedId, plugins, bags, report);
  }
  return { report, bags, plugins };
}

export async function importPluginConfigArchive(
  files: ArchiveFile[],
  installed: InstalledPlugin[],
  expectedId?: string,
): Promise<BulkReport> {
  const { report, bags, plugins } = planPluginConfigImport(files, installed, expectedId);
  await writeBags(bags, plugins, report);
  return report;
}

export async function importPluginConfigNamedFiles(
  files: Array<{ name: string; text: string }>,
  plugin: InstalledPlugin,
): Promise<BulkReport> {
  const archive: ArchiveFile[] = files.map((file) => ({
    path: `${plugin.id}/${file.name.replaceAll('\\', '/').split('/').pop() ?? file.name}`,
    data: Buffer.from(file.text, 'utf8'),
  }));
  return importPluginConfigArchive(archive, [plugin], plugin.id);
}

export async function importPluginConfigBuffer(
  buffer: Uint8Array,
  filename: string,
  installed: InstalledPlugin[],
  expectedId?: string,
): Promise<BulkReport> {
  let files: ArchiveFile[];
  try {
    files = await extractPluginArchive(buffer, filename);
  } catch (error) {
    if (error instanceof PluginArchiveError) throw error;
    throw new PluginArchiveError('invalid_archive', 'Archive must be .zip or .tgz.');
  }
  return importPluginConfigArchive(files, installed, expectedId);
}
