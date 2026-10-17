/** Small, deliberately non-exhaustive browser/OS summary for the "recent
 * logins" block — covers the common cases without pulling in a full
 * UA-parsing dependency for what's a nice-to-have display detail, not a
 * security decision. Falls back to null (never the raw string) when
 * nothing recognizable matches, since an unparsed UA string is more
 * confusing than just omitting the device column. */
export function summarizeUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Version\/.*Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  // iOS agents say "like Mac OS X", so iPhone/iPad must be checked first.
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(userAgent)
      ? 'iOS'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Android/.test(userAgent)
          ? 'Android'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os;
}
