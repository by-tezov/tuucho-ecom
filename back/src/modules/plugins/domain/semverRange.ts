/** Tiny semver range matcher for plugin `engines.core` and `dependsOn.version`.
 * Supports `*`, exact `1.2.3`, `^1.2.3`, `~1.2.3`, and comparator lists
 * such as `>=1.0.0 <2.0.0`. Pre-release suffixes are ignored. */

export type Semver = { major: number; minor: number; patch: number };

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
const TOKEN = /(\^|~|>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+(?:[-+][^\s]*)?)/g;

export function parseSemver(version: string): Semver | null {
  const match = version.trim().match(SEMVER);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function matchComparator(version: Semver, op: string, bound: Semver): boolean {
  const delta = compareSemver(version, bound);
  if (op === '>' ) return delta > 0;
  if (op === '>=') return delta >= 0;
  if (op === '<' ) return delta < 0;
  if (op === '<=') return delta <= 0;
  return delta === 0;
}

/** True when `version` satisfies `range`. Empty and `*` match anything. */
export function satisfiesRange(version: string, range: string | undefined): boolean {
  if (!range || range.trim() === '' || range.trim() === '*') return true;
  const parsed = parseSemver(version);
  if (!parsed) return false;
  const trimmed = range.trim();
  const tokens = [...trimmed.matchAll(TOKEN)];
  if (tokens.length === 0) return false;
  // Reject leftover junk so ">=1.0.0 oops" cannot sneak through.
  const consumed = tokens.map((token) => token[0]).join('').replace(/\s+/g, '');
  const compact = trimmed.replace(/\s+/g, '');
  if (consumed !== compact) return false;

  return tokens.every((token) => {
    const op = token[1] ?? '=';
    const bound = parseSemver(token[2] ?? '');
    if (!bound) return false;
    if (op === '^') {
      const nextMajor = { major: bound.major + 1, minor: 0, patch: 0 };
      if (bound.major === 0) {
        const nextMinor = { major: 0, minor: bound.minor + 1, patch: 0 };
        return matchComparator(parsed, '>=', bound) && matchComparator(parsed, '<', nextMinor);
      }
      return matchComparator(parsed, '>=', bound) && matchComparator(parsed, '<', nextMajor);
    }
    if (op === '~') {
      const nextMinor = { major: bound.major, minor: bound.minor + 1, patch: 0 };
      return matchComparator(parsed, '>=', bound) && matchComparator(parsed, '<', nextMinor);
    }
    return matchComparator(parsed, op, bound);
  });
}
