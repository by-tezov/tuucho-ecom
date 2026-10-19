import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../../../');

function readRootPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error('Root package.json must contain a MAJOR.MINOR.PATCH version');
  }
  return pkg.version;
}

/** Product version from repo-root package.json. Admin Plugins "Core" shows this.
 * Check / Apply still walk official tags via shop-release.json vs tag
 * release.json. A deployed shop cannot claim a kernel by editing package.json. */
export const CORE_VERSION = readRootPackageVersion();

/** Default range shipped plugins declare. Covers this 0.x product. */
export const DEFAULT_CORE_ENGINE = '>=0.0.1 <1.0.0';
