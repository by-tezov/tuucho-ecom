import type { AuthUser } from '../contract/identity';
import { takeSessionKey } from '../../utils/storageMigrate';

const STORAGE_PREFIX = 'psn-gift-pin-';
const LEGACY_PREFIX = 'pamsurin.giftPin.';

/** Set on a shop tab opened from administration (recipient, giver, or
 * impersonation). `identity.ts` and `adminSessionLand.ts` read this same
 * string so that tab does not adopt the administrator session. */
export const GIFT_RECEIVER_ISOLATED_KEY = 'psn-gift-receiver-isolated';

const IMPERSONATION_HANDOFF_KEY = 'psn-impersonate-handoff';

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

export function readImpersonationHandoff(): ImpersonationHandoff | null {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImpersonationHandoff>;
    if (!parsed.user || typeof parsed.accessToken !== 'string' || typeof parsed.accessTokenExpiresAt !== 'string') {
      return null;
    }
    return {
      user: parsed.user,
      accessToken: parsed.accessToken,
      accessTokenExpiresAt: parsed.accessTokenExpiresAt,
    };
  } catch {
    return null;
  }
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
