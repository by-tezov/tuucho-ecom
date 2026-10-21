import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CORE_VERSION } from '../../../../config/appVersion.js';
import { OFFICIAL_ORIGIN } from '../../domain/githubRepository.js';
import {
  LEGACY_RELEASE_CATALOGS,
  LEGACY_SHOP_RELEASES,
  TUCHO_VERSIONING_CATALOG,
  TUCHO_VERSIONING_CATALOG_COMMENT,
  TUCHO_VERSIONING_LOCK,
  TUCHO_VERSIONING_LOCK_COMMENT,
} from '../../domain/releaseFiles.js';
import { normalizeStoredReleaseTag, tagFromKernelVersion } from '../../domain/semverTags.js';
import { repoRoot } from '../discoverPlugins.js';
import { hashTree, treeFingerprint, type PathHash } from './treeHash.js';

export type ShopReleaseRecord = {
  origin: string;
  tag: string;
  kernel: string;
  releaseId: number | null;
  installedAt: string;
  tuuchoTreeHash: string | null;
  tuuchoFiles: PathHash[];
  updateInProgress?: {
    snapshotDir: string;
    databaseDump: string;
    startedAt: string;
  };
};

export function shopReleasePath(root = repoRoot()): string {
  return join(root, TUCHO_VERSIONING_LOCK);
}

async function readJsonIfPresent(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    return null;
  }
}

function parseShopReleaseRecord(raw: unknown): ShopReleaseRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Partial<ShopReleaseRecord>;
  if (typeof body.tag !== 'string' || typeof body.kernel !== 'string') return null;
  return {
    origin: typeof body.origin === 'string' ? body.origin : OFFICIAL_ORIGIN,
    tag: normalizeStoredReleaseTag(body.tag) ?? body.tag,
    kernel: body.kernel,
    releaseId: typeof body.releaseId === 'number' ? body.releaseId : null,
    installedAt: typeof body.installedAt === 'string' ? body.installedAt : new Date().toISOString(),
    tuuchoTreeHash: typeof body.tuuchoTreeHash === 'string' ? body.tuuchoTreeHash : null,
    tuuchoFiles: Array.isArray(body.tuuchoFiles)
      ? body.tuuchoFiles.filter(
          (entry): entry is PathHash =>
            Boolean(entry && typeof entry.path === 'string' && typeof entry.sha256 === 'string'),
        )
      : [],
    updateInProgress: body.updateInProgress,
  };
}

export async function readShopRelease(root = repoRoot()): Promise<ShopReleaseRecord | null> {
  const preferred = parseShopReleaseRecord(await readJsonIfPresent(shopReleasePath(root)));
  if (preferred) return preferred;
  for (const name of LEGACY_SHOP_RELEASES) {
    const found = parseShopReleaseRecord(await readJsonIfPresent(join(root, name)));
    if (found) return found;
  }
  return null;
}

export async function readLocalReleaseCatalog(root = repoRoot()): Promise<unknown | null> {
  for (const name of [TUCHO_VERSIONING_CATALOG, ...LEGACY_RELEASE_CATALOGS]) {
    const raw = await readJsonIfPresent(join(root, name));
    if (raw != null) return raw;
  }
  return null;
}

export async function inferredShopRelease(root = repoRoot()): Promise<ShopReleaseRecord> {
  const existing = await readShopRelease(root);
  if (existing) return existing;
  let kernel = CORE_VERSION;
  let tag = tagFromKernelVersion(CORE_VERSION);
  let releaseId: number | null = null;
  const catalog = await readLocalReleaseCatalog(root);
  if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
    const release = catalog as { kernel?: unknown; tag?: unknown; releaseId?: unknown };
    if (typeof release.kernel === 'string') kernel = release.kernel;
    if (typeof release.tag === 'string') tag = normalizeStoredReleaseTag(release.tag) ?? release.tag;
    if (typeof release.releaseId === 'number') releaseId = release.releaseId;
  }
  return {
    origin: OFFICIAL_ORIGIN,
    tag,
    kernel,
    releaseId,
    installedAt: new Date().toISOString(),
    tuuchoTreeHash: null,
    tuuchoFiles: [],
  };
}

export async function hashTuuchoTree(root = repoRoot()): Promise<{ fingerprint: string; files: PathHash[] }> {
  const files = await hashTree(join(root, 'tuucho'));
  return { fingerprint: treeFingerprint(files), files };
}

export async function writeShopRelease(
  record: ShopReleaseRecord,
  root = repoRoot(),
): Promise<void> {
  const path = shopReleasePath(root);
  await mkdir(dirname(path), { recursive: true });
  const body = {
    _comment: TUCHO_VERSIONING_LOCK_COMMENT,
    origin: OFFICIAL_ORIGIN,
    tag: normalizeStoredReleaseTag(record.tag) ?? record.tag,
    kernel: record.kernel,
    releaseId: record.releaseId,
    installedAt: record.installedAt,
    tuuchoTreeHash: record.tuuchoTreeHash,
    tuuchoFiles: record.tuuchoFiles,
    ...(record.updateInProgress ? { updateInProgress: record.updateInProgress } : {}),
  };
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`);
  for (const name of LEGACY_SHOP_RELEASES) {
    await rm(join(root, name), { force: true });
  }
}

export { TUCHO_VERSIONING_CATALOG_COMMENT };
