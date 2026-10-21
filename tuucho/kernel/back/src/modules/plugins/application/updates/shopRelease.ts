import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CORE_VERSION } from '../../../../config/appVersion.js';
import { OFFICIAL_ORIGIN } from '../../domain/githubRepository.js';
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
  return join(root, 'shop-release.json');
}

export async function readShopRelease(root = repoRoot()): Promise<ShopReleaseRecord | null> {
  try {
    const raw = JSON.parse(await readFile(shopReleasePath(root), 'utf8')) as Partial<ShopReleaseRecord>;
    if (typeof raw.tag !== 'string' || typeof raw.kernel !== 'string') return null;
    return {
      origin: typeof raw.origin === 'string' ? raw.origin : OFFICIAL_ORIGIN,
      tag: normalizeStoredReleaseTag(raw.tag) ?? raw.tag,
      kernel: raw.kernel,
      releaseId: typeof raw.releaseId === 'number' ? raw.releaseId : null,
      installedAt: typeof raw.installedAt === 'string' ? raw.installedAt : new Date().toISOString(),
      tuuchoTreeHash: typeof raw.tuuchoTreeHash === 'string' ? raw.tuuchoTreeHash : null,
      tuuchoFiles: Array.isArray(raw.tuuchoFiles)
        ? raw.tuuchoFiles.filter(
            (entry): entry is PathHash =>
              Boolean(entry && typeof entry.path === 'string' && typeof entry.sha256 === 'string'),
          )
        : [],
      updateInProgress: raw.updateInProgress,
    };
  } catch {
    return null;
  }
}

export async function inferredShopRelease(root = repoRoot()): Promise<ShopReleaseRecord> {
  const existing = await readShopRelease(root);
  if (existing) return existing;
  let kernel = CORE_VERSION;
  let tag = tagFromKernelVersion(CORE_VERSION);
  let releaseId: number | null = null;
  try {
    const release = JSON.parse(await readFile(join(root, 'release.json'), 'utf8')) as {
      kernel?: unknown;
      tag?: unknown;
      releaseId?: unknown;
    };
    if (typeof release.kernel === 'string') kernel = release.kernel;
    if (typeof release.tag === 'string') tag = normalizeStoredReleaseTag(release.tag) ?? release.tag;
    if (typeof release.releaseId === 'number') releaseId = release.releaseId;
  } catch {
    // Official catalog missing. Displayed Check current is live root
    // package.json; this record is last-applied Apply state and dirty hashes.
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
  const body: ShopReleaseRecord = {
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
}
