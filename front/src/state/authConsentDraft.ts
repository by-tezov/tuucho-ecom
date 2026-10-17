import { takeSessionKey } from '../utils/storageMigrate';

const STORAGE_KEY = 'psn-auth-consent-draft-v1';
const LEGAL_DETOUR_KEY = 'psn-auth-legal-detour-v1';
const LEGACY_STORAGE_KEY = 'pamsurin.authConsentDraft';
const LEGACY_LEGAL_DETOUR_KEY = 'pamsurin.authLegalDetour';

/** Who owns resuming this draft — AuthModal must not steal cart /login-page flows
 * (e.g. resizing cart Identification back to desktop). */
export type AuthConsentDraftSurface = 'auth-modal' | 'cart' | 'login-page';

/** Survives a terms/privacy detour so the CGU step (Google token or
 * password/OTP create) comes back instead of resetting to the start. */
export interface AuthConsentDraft {
  googleSignupToken?: string;
  appleSignupToken?: string;
  facebookSignupToken?: string;
  socialPendingToken?: string;
  socialProvider?: 'google' | 'apple' | 'facebook';
  socialEmail?: string | null;
  /** Verbose social create/link panel step — survives terms/privacy remounts. */
  socialChoiceStep?: 'choice' | 'consent' | 'linkEmail' | 'linkOtp';
  /** Email typed on the social-link OTP path. */
  socialLinkEmail?: string;
  /** LoginForm: user chose email/password over the social-first screen. */
  emailAuth?: boolean;
  /** Password/OTP create consent step in LoginForm. */
  step?: 'password' | 'otp';
  /** OTP code screen after request-otp succeeded — survives a parent remount. */
  otpSent?: boolean;
  rememberMe?: boolean;
  surface?: AuthConsentDraftSurface;
}

function readDraftRaw(): string | null {
  return takeSessionKey(STORAGE_KEY, LEGACY_STORAGE_KEY);
}

export function loadAuthConsentDraft(): AuthConsentDraft {
  try {
    const raw = readDraftRaw();
    if (!raw) return {};
    return JSON.parse(raw) as AuthConsentDraft;
  } catch {
    return {};
  }
}

export function saveAuthConsentDraft(draft: AuthConsentDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Private mode / quota — consent step just won't survive a legal detour.
  }
}

/**
 * Drop the connect draft. While a CGU/privacy detour is active, refuses to
 * clear unless `{ force: true }` (explicit decline / ✕ / success) — accidental
 * clears from overlay reclaim / remount races must not wipe "Accepter les
 * conditions".
 */
export function clearAuthConsentDraft(options?: { force?: boolean }): void {
  if (!options?.force && isAuthLegalDetour()) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
  endAuthLegalDetour();
}

/** Mark a CGU/privacy detour so the pending draft cannot be wiped. */
export function beginAuthLegalDetour(): void {
  try {
    sessionStorage.setItem(LEGAL_DETOUR_KEY, '1');
    sessionStorage.removeItem(LEGACY_LEGAL_DETOUR_KEY);
  } catch {
    // ignore
  }
}

export function isAuthLegalDetour(): boolean {
  try {
    return takeSessionKey(LEGAL_DETOUR_KEY, LEGACY_LEGAL_DETOUR_KEY) === '1';
  } catch {
    return false;
  }
}

export function endAuthLegalDetour(): void {
  try {
    sessionStorage.removeItem(LEGAL_DETOUR_KEY);
    sessionStorage.removeItem(LEGACY_LEGAL_DETOUR_KEY);
  } catch {
    // ignore
  }
}

/** True when a connect flow should resume (CGU step, OTP, social create/link). */
export function hasPendingAuthConsentDraft(): boolean {
  const draft = loadAuthConsentDraft();
  return Boolean(
    draft.googleSignupToken ||
    draft.appleSignupToken ||
    draft.facebookSignupToken ||
    draft.socialPendingToken ||
    draft.step ||
    draft.otpSent,
  );
}

/** Pending draft that desktop AuthModal may reopen — not cart / login-page. */
export function shouldResumeAuthModalDraft(): boolean {
  if (!hasPendingAuthConsentDraft()) return false;
  const surface = loadAuthConsentDraft().surface;
  return surface === 'auth-modal' || surface === undefined;
}

/** Pending Identification draft owned by /cart — Layout keeps CartPage mounted
 * (hidden) on the real /terms|/privacy pages, same idea as AuthModal.suspended. */
export function shouldResumeCartAuthDraft(): boolean {
  if (!hasPendingAuthConsentDraft()) return false;
  return loadAuthConsentDraft().surface === 'cart';
}

/** Merge-patch — keeps unrelated draft fields (e.g. emailAuth while saving a
 * Google CGU token). Prefer this when only flipping one flag. */
export function patchAuthConsentDraft(patch: AuthConsentDraft): void {
  saveAuthConsentDraft({ ...loadAuthConsentDraft(), ...patch });
}

/** True only for a full browser reload — SPA navigations (e.g. terms → cart
 * return) stay `navigate` so drafts can still restore.
 *
 * WARNING: the value is fixed for the life of the document. After one F5 it
 * stays `true` forever — never use it alone to decide "this remount is a
 * cold reload" (that wiped Google create→CGU on every cart remount). */
function isDocumentReload(): boolean {
  if (typeof performance === 'undefined') return false;
  const entries = performance.getEntriesByType('navigation');
  const nav = entries[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === 'reload';
}

/**
 * Once per JS load: if this document was opened via F5/reload, drop the
 * verbose social create/link draft (unless a CGU/privacy detour is in flight).
 * Module-scoped so SPA remounts after /terms|/privacy do not re-run the wipe —
 * that was the cart Identification bug (back from CGU → social-first).
 */
let coldReloadSocialChoiceResetDone = false;
function resetSocialChoiceDraftAfterColdReload(): void {
  if (coldReloadSocialChoiceResetDone) return;
  coldReloadSocialChoiceResetDone = true;
  if (!isDocumentReload()) return;
  if (isAuthLegalDetour()) return;
  clearSocialAccountChoiceDraft();
}

/** Drop verbose create/link pending state only — leave email/consent drafts,
 * Google/Apple/Facebook CGU tokens, OTP step flags, etc. untouched. */
function clearSocialAccountChoiceDraft(): void {
  if (isAuthLegalDetour()) return;
  const draft = loadAuthConsentDraft();
  if (
    draft.socialPendingToken === undefined &&
    draft.socialProvider === undefined &&
    draft.socialEmail === undefined
  ) {
    return;
  }
  const next: AuthConsentDraft = { ...draft };
  delete next.socialPendingToken;
  delete next.socialProvider;
  delete next.socialEmail;
  delete next.socialChoiceStep;
  delete next.socialLinkEmail;
  if (
    next.googleSignupToken === undefined &&
    next.appleSignupToken === undefined &&
    next.facebookSignupToken === undefined &&
    next.step === undefined &&
    next.otpSent === undefined &&
    next.rememberMe === undefined &&
    next.emailAuth === undefined &&
    next.surface === undefined
  ) {
    clearAuthConsentDraft({ force: true });
    return;
  }
  saveAuthConsentDraft(next);
}

/** Restore pending create/link panel from sessionStorage (cart /login / AuthModal). */
export function loadSocialAccountChoicePending(): {
  success: true;
  needsAccountChoice: true;
  socialPendingToken: string;
  provider: 'google' | 'apple' | 'facebook';
  socialEmail: string | null;
} | null {
  resetSocialChoiceDraftAfterColdReload();
  const draft = loadAuthConsentDraft();
  if (!draft.socialPendingToken || !draft.socialProvider) return null;
  return {
    success: true,
    needsAccountChoice: true,
    socialPendingToken: draft.socialPendingToken,
    provider: draft.socialProvider,
    socialEmail: draft.socialEmail ?? null,
  };
}
