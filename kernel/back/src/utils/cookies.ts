import type { Request } from 'express';

const REFRESH_COOKIE_NAME = 'refresh_token';

/** No cookie-parser dependency — this is the only cookie this API ever
 * reads, so a tiny hand-rolled parser matches the codebase's
 * minimal-dependency stance better than a new package for one job. */
export function getRefreshTokenCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === REFRESH_COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        // A malformed cookie is an invalid session, not an uncaught 500.
        return undefined;
      }
    }
  }
  return undefined;
}

/** Front and API are cross-origin but same-site: their scheme and
 * registrable domain match (`shop.example`, subdomain ignored by SameSite).
 * Lax therefore still accompanies credentialed fetches between them while
 * refusing genuinely cross-site cookie sends. Production additionally
 * requires HTTPS; local dev cannot use Secure on plain localhost. */
function cookieAttributes(isDevelopment: boolean): string {
  return isDevelopment ? 'HttpOnly; Path=/auth; SameSite=Lax' : 'HttpOnly; Path=/auth; SameSite=Lax; Secure';
}

/** A remembered login gets a persistent browser cookie matching the token's
 * server-side expiry. An ordinary login deliberately omits Expires/Max-Age,
 * making it a browser-session cookie that is discarded when the browser
 * session ends. */
export function serializeRefreshTokenCookie(
  rawToken: string,
  expiresAtIso: string,
  rememberMe: boolean,
  isDevelopment: boolean,
): string {
  const base = `${REFRESH_COOKIE_NAME}=${encodeURIComponent(rawToken)}; ${cookieAttributes(isDevelopment)}`;
  if (!rememberMe) return base;
  return `${base}; Expires=${new Date(expiresAtIso).toUTCString()}`;
}

export function clearRefreshTokenCookie(isDevelopment: boolean): string {
  return `${REFRESH_COOKIE_NAME}=; ${cookieAttributes(isDevelopment)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
