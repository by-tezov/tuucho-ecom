import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applicationRoot, shopRoot } from './applicationRoot.js';

function readPackageVersionAt(dir: string): string | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) return null;
  return pkg.version;
}

function readCatalogKernel(dir: string): string | null {
  const catalogPath = join(dir, 'tuucho', 'tuucho-versioning.json');
  if (!existsSync(catalogPath)) return null;
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { kernel?: unknown };
  if (typeof catalog.kernel !== 'string' || !/^\d+\.\d+\.\d+$/.test(catalog.kernel)) return null;
  return catalog.kernel;
}

function readFactoryRootPackageVersion(dir: string): string | null {
  return readPackageVersionAt(join(dir, 'tuucho', 'factory-backup', 'root'));
}

/**
 * Live product version (MAJOR.MINOR.PATCH).
 * Prefer `tuucho/tuucho-versioning.json` kernel (Apply updates `tuucho/`, never shop
 * root package.json). Then factory scaffold package, then a walk for dist builds.
 * Admin Plugins "Core" and Check "current" re-read this on each request.
 */
export function readRootPackageVersion(): string {
  const fromCatalog = readCatalogKernel(shopRoot);
  if (fromCatalog) return fromCatalog;

  const fromFactory = readFactoryRootPackageVersion(shopRoot);
  if (fromFactory) return fromFactory;

  let dir = applicationRoot;
  for (let i = 0; i < 10; i += 1) {
    const version = readPackageVersionAt(dir);
    if (version) return version;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Product version missing: tuucho/tuucho-versioning.json kernel or a MAJOR.MINOR.PATCH package.json',
  );
}

/** Bare product version (`0.9.8`). Use for backup ids / manifests. Snapshot
 * of {@link readRootPackageVersion} at process start. */
export const packageVersion = readRootPackageVersion();

/** Snapshot of {@link readRootPackageVersion} at process start. Plugin
 * engines.core matching still uses this; Check and Plugins Core re-read. */
export const CORE_VERSION = packageVersion;

/** Display form (`v0.9.8`) for chat subjects, email headers, etc. */
export const appVersion = `v${packageVersion}`;
