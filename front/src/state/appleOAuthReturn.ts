import type { Lang } from '../assets/i18n/types';
import type { AuthReturnTo } from './authCredentialsState';
import { takeSessionKey } from '../utils/storageMigrate';

const PENDING_KEY = 'psn-apple-oauth-return-v1';
const BRIDGE_KEY = 'psn-apple-oauth-return-bridge-v1';
const LINK_CREDENTIAL_KEY = 'psn-apple-link-credential-v1';
const LEGACY_PENDING_KEY = 'pamsurin.appleOAuthReturn';
const LEGACY_BRIDGE_KEY = 'pamsurin.appleOAuthReturnBridge';
const LEGACY_LINK_CREDENTIAL_KEY = 'pamsurin.appleLinkCredential';

/** Context kept while Apple performs a full-page form_post redirect. */
export interface AppleOAuthReturnPending {
  resumePath: string;
  purpose: 'signIn' | 'link';
  rememberMe?: boolean;
  gdprAccepted?: boolean;
  language?: Lang;
  authReturnTo?: AuthReturnTo;
  unlockToken?: string;
  state: string;
  /** Raw Apple nonce (SHA-256 hex was sent to Apple). */
  nonce: string;
}

export interface AppleOAuthReturnBridge {
  idToken: string | null;
  state: string | null;
  error: string | null;
}

export function takeAppleOAuthReturnPending(): AppleOAuthReturnPending | null {
  try {
    const raw = takeSessionKey(PENDING_KEY, LEGACY_PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(LEGACY_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppleOAuthReturnPending>;
    if (
      !parsed ||
      typeof parsed.resumePath !== 'string' ||
      !parsed.resumePath.startsWith('/') ||
      (parsed.purpose !== 'signIn' && parsed.purpose !== 'link') ||
      typeof parsed.state !== 'string' ||
      !parsed.state ||
      typeof parsed.nonce !== 'string' ||
      !parsed.nonce
    ) {
      return null;
    }
    return parsed as AppleOAuthReturnPending;
  } catch {
    return null;
  }
}

export interface AppleLinkCredential {
  idToken: string;
  unlockToken: string;
  nonce: string;
}

export function stashAppleLinkCredential(credential: AppleLinkCredential): void {
  try {
    sessionStorage.setItem(LINK_CREDENTIAL_KEY, JSON.stringify(credential));
    sessionStorage.removeItem(LEGACY_LINK_CREDENTIAL_KEY);
  } catch {
    // Account page will simply show the normal link action again.
  }
}

export function takeAppleLinkCredential(): AppleLinkCredential | null {
  try {
    const raw = takeSessionKey(LINK_CREDENTIAL_KEY, LEGACY_LINK_CREDENTIAL_KEY);
    sessionStorage.removeItem(LINK_CREDENTIAL_KEY);
    sessionStorage.removeItem(LEGACY_LINK_CREDENTIAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppleLinkCredential>;
    if (typeof parsed.idToken !== 'string' || !parsed.idToken.trim()) return null;
    if (typeof parsed.unlockToken !== 'string' || !parsed.unlockToken.trim()) return null;
    if (typeof parsed.nonce !== 'string' || !parsed.nonce.trim()) return null;
    return {
      idToken: parsed.idToken.trim(),
      unlockToken: parsed.unlockToken.trim(),
      nonce: parsed.nonce.trim(),
    };
  } catch {
    return null;
  }
}

/** Payload placed in sessionStorage by public/apple-return.php after Apple's form_post. */
export function takeAppleOAuthReturnBridge(): AppleOAuthReturnBridge | null {
  try {
    const raw = takeSessionKey(BRIDGE_KEY, LEGACY_BRIDGE_KEY);
    sessionStorage.removeItem(BRIDGE_KEY);
    sessionStorage.removeItem(LEGACY_BRIDGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppleOAuthReturnBridge>;
    const idToken = typeof parsed.idToken === 'string' ? parsed.idToken.trim() : null;
    const state = typeof parsed.state === 'string' ? parsed.state.trim() : null;
    const error = typeof parsed.error === 'string' ? parsed.error.trim() : null;
    if (!idToken && !error) return null;
    return { idToken: idToken || null, state, error };
  } catch {
    return null;
  }
}
