import { CORE_VERSION } from '../src/config/appVersion.js';
import { OFFICIAL_ORIGIN } from '../src/modules/plugins/domain/githubRepository.js';
import { tagFromKernelVersion } from '../src/modules/plugins/domain/semverTags.js';
import { hashTuuchoTree, readShopRelease, writeShopRelease } from '../src/modules/plugins/application/updates/shopRelease.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repoRoot } from '../src/modules/plugins/application/discoverPlugins.js';

async function main() {
  const hashed = await hashTuuchoTree();
  const existing = await readShopRelease();
  let releaseId = existing?.releaseId ?? null;
  try {
    const release = JSON.parse(await readFile(join(repoRoot(), 'release.json'), 'utf8')) as { releaseId?: number };
    if (typeof release.releaseId === 'number') releaseId = release.releaseId;
  } catch {
    // release.json is committed; missing only on a broken checkout.
  }
  await writeShopRelease({
    origin: OFFICIAL_ORIGIN,
    tag: tagFromKernelVersion(CORE_VERSION),
    kernel: CORE_VERSION,
    releaseId,
    installedAt: new Date().toISOString(),
    tuuchoTreeHash: hashed.fingerprint,
    tuuchoFiles: hashed.files,
  });
  console.log(`[setup] wrote shop-release.json for ${CORE_VERSION}`);
}

void main();
