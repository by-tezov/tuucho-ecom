import type { AuthUser } from '../contract/identity';
import { takeSessionKey } from '../../utils/storageMigrate';

const STORAGE_PREFIX = 'psn-gift-pin-';
const LEGACY_PREFIX = 'pamsurin.giftPin.';

/** Set on a shop tab opened from administration (recipient, giver, or
 * impersonation). `identity.ts` and `adminSessionLand.ts` read this same
 * string so that tab does not adopt the administrator session. */
export const GIFT_RECEIVER_ISOLATED_KEY = 'psn-gift-receiver-isolated';

const IMPERSONATION_HANDOFF_KEY = 'psn-impersonate-handoff';

/** One-shot localStorage copy of the popup handoff. Navigating the popup
 * from about:blank to /account can drop its sessionStorage on some browsers,
 * which used to lose the impersonated session and land on /. localStorage is
 * shared across same-origin tabs, so the admin tab writes it right before the
 * navigation and the new tab deletes it on first read, even when expired. */
const IMPERSONATION_HANDOFF_FALLBACK_KEY = 'tuucho-impersonate-handoff';
const IMPERSONATION_HANDOFF_FALLBACK_TTL_MS = 30_000;

export interface ImpersonationHandoff {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}

/** Hands the customer access token to a new tab. The administrator tab never
 * applies it. The new tab must also carry `GIFT_RECEIVER_ISOLATED_KEY`. */
export function writeImpersonationHandoff(storage: Storage, session: ImpersonationHandoff): void {
  storage.setItem(GIFT_RECEIVER_ISOLATED_KEY, '1');
  storage.setItem(
    IMPERSONATION_HANDOFF_KEY,
    JSON.stringify({
      user: session.user,
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
    }),
  );
}

/** Writes the localStorage one-shot fallback from the tab that opened the
 * popup (same origin, so the popup reads it). Best-effort: storage failures
 * just leave the original sessionStorage path as the only carrier. */
export function writeImpersonationHandoffFallback(session: ImpersonationHandoff): void {
  try {
    localStorage.setItem(
      IMPERSONATION_HANDOFF_FALLBACK_KEY,
      JSON.stringify({
        user: session.user,
        accessToken: session.accessToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
        createdAt: Date.now(),
      }),
    );
  } catch {
    // Storage unavailable: the sessionStorage handoff still applies.
  }
}

function parseImpersonationHandoff(parsed: Partial<ImpersonationHandoff>): ImpersonationHandoff | null {
  if (
    !parsed.user ||
    typeof parsed.accessToken !== 'string' ||
    typeof parsed.accessTokenExpiresAt !== 'string'
  ) {
    return null;
  }
  return {
    user: parsed.user,
    accessToken: parsed.accessToken,
    accessTokenExpiresAt: parsed.accessTokenExpiresAt,
  };
}

/** Reads and always deletes the localStorage fallback, expired or not — it is
 * a single-use bridge for the navigation that just happened, never a session
 * store. Returns null past the TTL. */
function takeImpersonationHandoffFallback(): ImpersonationHandoff | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_HANDOFF_FALLBACK_KEY);
    localStorage.removeItem(IMPERSONATION_HANDOFF_FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImpersonationHandoff> & { createdAt?: unknown };
    if (
      typeof parsed.createdAt !== 'number' ||
      Date.now() - parsed.createdAt > IMPERSONATION_HANDOFF_FALLBACK_TTL_MS
    ) {
      return null;
    }
    return parseImpersonationHandoff(parsed);
  } catch {
    return null;
  }
}

export function readImpersonationHandoff(): ImpersonationHandoff | null {
  // Always take (read + delete) the one-shot first: even when sessionStorage
  // answers, the fallback must not linger in localStorage holding a token.
  const fallback = takeImpersonationHandoffFallback();
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_HANDOFF_KEY);
    if (raw) {
      const parsed = parseImpersonationHandoff(JSON.parse(raw) as Partial<ImpersonationHandoff>);
      if (parsed) return parsed;
    }
  } catch {
    return null;
  }
  return fallback;
}

export type GiftPinRole = 'giver' | 'receiver';

export function giftPinStorageKey(role: GiftPinRole, token: string): string {
  return `${STORAGE_PREFIX}${role}.${token}`;
}

function legacyKey(role: GiftPinRole, token: string): string {
  return `${LEGACY_PREFIX}${role}.${token}`;
}

export function readGiftPinGrant(role: GiftPinRole, token: string): string | null {
  if (typeof sessionStorage === 'undefined' || !token) return null;
  return takeSessionKey(giftPinStorageKey(role, token), legacyKey(role, token));
}

export function writeGiftPinGrant(role: GiftPinRole, token: string, pinToken: string): void {
  const key = giftPinStorageKey(role, token);
  sessionStorage.setItem(key, pinToken);
  try {
    sessionStorage.removeItem(legacyKey(role, token));
  } catch {
    // ignore
  }
}

export function clearGiftPinGrant(role: GiftPinRole, token: string): void {
  sessionStorage.removeItem(giftPinStorageKey(role, token));
  try {
    sessionStorage.removeItem(legacyKey(role, token));
  } catch {
    // ignore
  }
}
