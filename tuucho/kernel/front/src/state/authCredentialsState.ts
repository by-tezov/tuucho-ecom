import { GALLERY_PATH, HOME_PATH } from '../config/paths';
import { localizedPath } from '../config/i18nRoutes';
import type { Lang } from '../assets/i18n/types';
import { isMobileBackViewport } from '../utils/mobileBackNavigation';

/** Router `location.state` contract passed between /login and /register
 * so switching between them (a user starts on one,
 * realizes they meant another) doesn't discard what was already typed —
 * mirrors AuthModal's shared email/password state for the desktop modal
 * equivalent of this same flow. */
export interface AuthCredentialsState {
  email?: string;
  password?: string;
  /** Internal destination to resume after authentication. Kept deliberately
   * narrow — a closed set of literals, never a caller-supplied path — so
   * arbitrary router state can never become an open redirect. */
  returnTo?: AuthReturnTo;
}

/** Every place a customer can be sent back to once signed in. `/cart` is
 * the guest-checkout prompt; `/contact` is the guest contact page's "log in
 * for the account chat" hint. */
export type AuthReturnTo = '/cart' | '/contact';

const RETURN_TO_ALLOWED: AuthReturnTo[] = ['/cart', '/contact'];

/** Resolves to a locale-prefixed URL (per `lang`) built entirely from the
 * closed allowlist above / HOME_PATH / GALLERY_PATH — `localizedPath` never
 * sees caller-supplied input, so the open-redirect protection those
 * literals exist for still holds. */
export function authReturnTo(state: unknown, lang: Lang): string {
  const requested = (state as AuthCredentialsState | null)?.returnTo;
  const explicit = RETURN_TO_ALLOWED.find((allowed) => allowed === requested);
  if (explicit) return localizedPath(explicit, lang);
  // No specific place to resume (cart / sold-out gallery / contact) — on
  // mobile, land in the gallery instead of Accueil, since that's what
  // "continue browsing" means coming out of a dedicated mobile auth page
  // (/login, /register — desktop's AuthModal equivalent
  // never calls this at all, a successful login there just closes the
  // modal and stays put, so nothing here affects it).
  return localizedPath(isMobileBackViewport() ? GALLERY_PATH : HOME_PATH, lang);
}
