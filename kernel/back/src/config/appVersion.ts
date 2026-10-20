import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applicationRoot } from './applicationRoot.js';

function readPackageVersionAt(dir: string): string | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) return null;
  return pkg.version;
}

/** Live product version from repo-root package.json (MAJOR.MINOR.PATCH).
 * Walks toward the filesystem root so source (root package.json) and a dist
 * artifact (version injected at build) both resolve. Admin Plugins "Core"
 * and Check "current" re-read this on each request so a stale
 * shop-release.json or leftover CORE_VERSION cannot win the display. */
export function readRootPackageVersion(): string {
  let dir = applicationRoot;
  for (let i = 0; i < 10; i += 1) {
    const version = readPackageVersionAt(dir);
    if (version) return version;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Root package.json must contain a MAJOR.MINOR.PATCH version');
}

/** Bare product version (`0.9.8`). Use for backup ids / manifests. Snapshot
 * of {@link readRootPackageVersion} at process start. */
export const packageVersion = readRootPackageVersion();

/** Snapshot of {@link readRootPackageVersion} at process start. Plugin
 * engines.core matching still uses this; Check and Plugins Core re-read. */
export const CORE_VERSION = packageVersion;

/** Display form (`v0.9.8`) for chat subjects, email headers, etc. */
export const appVersion = `v${packageVersion}`;
