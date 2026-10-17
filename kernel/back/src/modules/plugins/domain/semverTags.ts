import { compareSemver, parseSemver, type Semver } from './semverRange.js';

const TAG = /^(\d+\.\d+\.\d+)$/;

export type ReleaseTag = {
  tag: string;
  version: string;
  semver: Semver;
};

/** Release tags only: `1.2.3`. Drops `v1.2.3`, `master`, branches, and `-rc` / `-beta`. */
export function parseReleaseTag(name: string): ReleaseTag | null {
  const trimmed = name.trim();
  const match = trimmed.match(TAG);
  if (!match) return null;
  const version = match[1]!;
  const semver = parseSemver(version);
  if (!semver) return null;
  return { tag: version, version, semver };
}

/** Local shop-release files may still hold a legacy `v` prefix; GitHub tags never use this. */
export function normalizeStoredReleaseTag(tag: string): string | null {
  const direct = parseReleaseTag(tag);
  if (direct) return direct.tag;
  const trimmed = tag.trim();
  if (trimmed.startsWith('v') || trimmed.startsWith('V')) {
    return parseReleaseTag(trimmed.slice(1))?.tag ?? null;
  }
  return null;
}

export function sortReleaseTags(tags: ReleaseTag[]): ReleaseTag[] {
  return [...tags].sort((left, right) => compareSemver(left.semver, right.semver));
}

/**
 * Exclusive after `from`, inclusive through `to`. Empty when already current.
 * Throws when `to` is not after `from` (except equal, which yields []).
 */
export function walkTagsBetween(from: ReleaseTag, to: ReleaseTag, catalog: ReleaseTag[]): ReleaseTag[] {
  if (compareSemver(to.semver, from.semver) < 0) {
    throw new Error(`Latest tag ${to.tag} is older than the shop tag ${from.tag}.`);
  }
  if (compareSemver(to.semver, from.semver) === 0) return [];
  const sorted = sortReleaseTags(catalog);
  const walked = sorted.filter(
    (entry) => compareSemver(entry.semver, from.semver) > 0 && compareSemver(entry.semver, to.semver) <= 0,
  );
  if (walked.length === 0 || walked[walked.length - 1]!.tag !== to.tag) {
    throw new Error(`Tag ${to.tag} is missing from the origin catalog.`);
  }
  return walked;
}

export function assertReleaseIdSequence(currentId: number, nextIds: number[]): void {
  let expected = currentId + 1;
  for (const id of nextIds) {
    if (id !== expected) {
      throw new Error(`releaseId hole: expected ${expected}, got ${id}. Skipping tags is forbidden.`);
    }
    expected += 1;
  }
}

export function tagFromKernelVersion(version: string): string {
  const parsed = parseSemver(version);
  if (!parsed) throw new Error(`Invalid kernel version ${version}.`);
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}
