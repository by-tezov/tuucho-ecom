import { CORE_VERSION } from '../src/config/appVersion.js';
import { OFFICIAL_ORIGIN } from '../src/modules/plugins/domain/githubRepository.js';
import { tagFromKernelVersion } from '../src/modules/plugins/domain/semverTags.js';
import {
  hashTuuchoTree,
  readLocalReleaseCatalog,
  readShopRelease,
  writeShopRelease,
} from '../src/modules/plugins/application/updates/shopRelease.js';
import { TUCHO_VERSIONING_LOCK } from '../src/modules/plugins/domain/releaseFiles.js';

async function main() {
  const hashed = await hashTuuchoTree();
  const existing = await readShopRelease();
  let releaseId = existing?.releaseId ?? null;
  const catalog = await readLocalReleaseCatalog();
  if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
    const release = catalog as { releaseId?: number };
    if (typeof release.releaseId === 'number') releaseId = release.releaseId;
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
  console.log(`[setup] wrote ${TUCHO_VERSIONING_LOCK} for ${CORE_VERSION}`);
}

void main();
