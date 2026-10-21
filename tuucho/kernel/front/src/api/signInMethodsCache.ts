/** Last known `GET /auth/sign-in-methods` answer, kept in localStorage so the
 * connect modal can paint its buttons immediately instead of waiting on the
 * network.
 *
 * Why this exists: the API runs under Passenger, which reaps an idle
 * application after 300s. On a quiet shop the first visitor to open the modal
 * pays a full Node boot, measured at 3.93s on prod against ~65ms once warm.
 * LoginForm holds `signInMethodsReady` false until the call settles (so the
 * layout never flashes email-only and then switches to social), which turns
 * that boot into four seconds of placeholder. `operation/cron/main-cron-warm.sh`
 * in kernel/back attacks the boot itself; this removes the wait even when
 * the app is genuinely cold.
 *
 * The cached value is a display hint, never an authorization decision: it
 * chooses which buttons to draw, and the server still validates every sign-in
 * attempt. The flags are shop-wide admin preferences that change roughly never,
 * so the worst case is a visitor briefly seeing a provider that was disabled
 * moments ago, whose attempt then fails cleanly. The live response always wins
 * as soon as it arrives.
 *
 * Deliberately not given a TTL. An expiry would only reintroduce the blank
 * wait on a schedule, and a stale entry is corrected by the revalidation that
 * runs on every single modal open anyway.
 */
import type { ShopSignInMethods } from './contract/checkout';
import { takeLocalKey } from '../utils/storageMigrate';

const STORAGE_KEY = 'tuucho-sign-in-methods';
const LEGACY_STORAGE_KEY = 'pamsurin-sign-in-methods';

function isShopSignInMethods(value: unknown): value is ShopSignInMethods {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  // Only the three provider flags are required. The *Verbose and
  // facebookMobileDirectOAuthEnabled fields were added later and an entry
  // written by an older build must still be usable rather than discarded.
  return (
    typeof candidate.google === 'boolean' &&
    typeof candidate.apple === 'boolean' &&
    typeof candidate.facebook === 'boolean'
  );
}

/** The last stored answer, or undefined when there is none, storage is
 * unavailable (private mode, blocked site data), or the entry predates a shape
 * change. Never throws: a broken cache must degrade to the normal fetch. */
export function readCachedShopSignInMethods(): ShopSignInMethods | undefined {
  try {
    const raw = takeLocalKey(STORAGE_KEY, LEGACY_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isShopSignInMethods(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Records a fresh answer. Failure is ignored on purpose: a full or read-only
 * storage must not break signing in. */
export function writeCachedShopSignInMethods(methods: ShopSignInMethods): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(methods));
  } catch {
    /* storage unavailable or full — the next open just fetches again */
  }
}
