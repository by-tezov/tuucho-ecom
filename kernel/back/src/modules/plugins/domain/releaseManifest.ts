import { parseSemver } from './semverRange.js';
import { parseReleaseTag, tagFromKernelVersion } from './semverTags.js';

export type ReleasePluginEntry = {
  id: string;
  version: string;
  installPath: string;
};

export type ShopReleaseManifest = {
  tag: string;
  kernel: string;
  releaseId: number;
  kernelMigrations: string[];
  plugins: ReleasePluginEntry[];
};

export type PluginReleaseManifest = {
  id: string;
  version: string;
  tag: string;
  releaseId: number;
  migrations: string[];
  changelog?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) return null;
    out.push(entry.trim());
  }
  return out;
}

export function parseShopReleaseManifest(raw: unknown): ShopReleaseManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('release.json must be an object.');
  }
  const body = raw as Record<string, unknown>;
  const tag = asString(body.tag);
  const kernel = asString(body.kernel);
  const releaseId = body.releaseId;
  const kernelMigrations = asStringArray(body.kernelMigrations);
  if (!tag || !parseReleaseTag(tag)) throw new Error('release.json tag must be MAJOR.MINOR.PATCH (no v prefix).');
  if (!kernel || !parseSemver(kernel)) throw new Error('release.json kernel must be MAJOR.MINOR.PATCH.');
  if (tag !== tagFromKernelVersion(kernel)) {
    throw new Error(`release.json tag ${tag} does not match kernel ${kernel}.`);
  }
  if (typeof releaseId !== 'number' || !Number.isInteger(releaseId) || releaseId < 1) {
    throw new Error('release.json releaseId must be a positive integer.');
  }
  if (!kernelMigrations) throw new Error('release.json kernelMigrations must be a string array.');
  if (!Array.isArray(body.plugins)) throw new Error('release.json plugins must be an array.');
  const plugins: ReleasePluginEntry[] = [];
  for (const entry of body.plugins) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('release.json plugin row is invalid.');
    }
    const row = entry as Record<string, unknown>;
    const id = asString(row.id);
    const version = asString(row.version);
    const installPath = asString(row.installPath);
    if (!id || !version || !installPath) throw new Error('release.json plugin needs id, version, installPath.');
    if (!installPath.startsWith('plugins/tuucho/') || installPath.split('/').pop() !== id) {
      throw new Error(`release.json installPath for ${id} must be under plugins/tuucho/ and end with the id.`);
    }
    plugins.push({ id, version, installPath });
  }
  return { tag, kernel, releaseId, kernelMigrations, plugins };
}

export function parsePluginReleaseManifest(raw: unknown, fallback?: { id: string; version: string; tag: string }): PluginReleaseManifest {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const body = raw as Record<string, unknown>;
    const id = asString(body.id);
    const version = asString(body.version);
    const tag = asString(body.tag);
    const releaseId = body.releaseId;
    const migrations = asStringArray(body.migrations) ?? [];
    if (!id || !version || !tag) throw new Error('plugin-release.json needs id, version, tag.');
    if (typeof releaseId !== 'number' || !Number.isInteger(releaseId) || releaseId < 1) {
      throw new Error('plugin-release.json releaseId must be a positive integer.');
    }
    const parsedTag = parseReleaseTag(tag);
    if (!parsedTag) throw new Error('plugin-release.json tag must be MAJOR.MINOR.PATCH (no v prefix).');
    if (parsedTag.version !== version) {
      throw new Error(`plugin-release.json version ${version} does not match tag ${tag}.`);
    }
    const changelog = asString(body.changelog);
    return { id, version, tag, releaseId, migrations, ...(changelog ? { changelog } : {}) };
  }
  if (!fallback) throw new Error('plugin-release.json is required for updates.');
  const parsedTag = parseReleaseTag(fallback.tag);
  if (!parsedTag || parsedTag.version !== fallback.version) {
    throw new Error(`plugin.json version ${fallback.version} does not match tag ${fallback.tag}.`);
  }
  return {
    id: fallback.id,
    version: fallback.version,
    tag: fallback.tag,
    releaseId: parsedTag.semver.patch + parsedTag.semver.minor * 100 + parsedTag.semver.major * 10_000,
    migrations: [],
  };
}
