/** Loopback/private ranges never resolve to anything meaningful — always
 * true in local dev (see app.ts's trust-proxy comment: req.ip is the raw
 * socket address there, not a real client IP). Skipping these avoids a
 * doomed network call on every local login. */
const PRIVATE_IP_PATTERN = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd])/i;

interface IpWhoIsResponse {
  success?: boolean;
  city?: string;
  country?: string;
  country_code?: string;
}

const ISO2 = /^[A-Z]{2}$/;

function normalizeCountryCode(value: string | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return ISO2.test(code) ? code : null;
}


/** Async geo lookup when no CDN country header is present. */
export async function resolveGeoCountryCodeAsync(
  ip: string | undefined,
  cfIpCountry: string | undefined,
): Promise<string | null> {
  const fromHeader = normalizeCountryCode(cfIpCountry);
  if (fromHeader) return fromHeader;
  if (!ip || PRIVATE_IP_PATTERN.test(ip)) return null;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as IpWhoIsResponse;
    if (data.success !== true) return null;
    return normalizeCountryCode(data.country_code);
  } catch {
    return null;
  }
}

/** Best-effort "City, Country" for a login's IP, resolved once at
 * createRefreshToken time and stored as a snapshot (see token.service.ts) —
 * never re-resolved later. Uses ipwho.is's HTTPS endpoint; a
 * failure, timeout, or private/unrouteable IP just means no location is
 * stored — login itself must never be blocked or meaningfully slowed by
 * this, hence the short timeout and blanket catch. */
export async function resolveLoginLocation(ip: string | undefined): Promise<string | null> {
  if (!ip || PRIVATE_IP_PATTERN.test(ip)) return null;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as IpWhoIsResponse;
    if (data.success !== true) return null;
    return [data.city, data.country].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}
