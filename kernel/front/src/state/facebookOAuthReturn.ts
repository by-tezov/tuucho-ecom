import type { Lang } from '../assets/i18n/types';
import type { AuthReturnTo } from './authCredentialsState';
import { shopConfig } from '../config/env';

import { takeSessionKey } from '../utils/storageMigrate';

const PENDING_KEY = 'psn-facebook-oauth-return-v1';
const LEGACY_PENDING_KEY = 'pamsurin.facebookOAuthReturn';
const FACEBOOK_OAUTH_VERSION = 'v26.0';
let pendingFacebookLinkAccessToken: string | null = null;

/** Survives the full-page Facebook redirect (in-app browsers) so we can
 * resume on the page that started login/link. */
export interface FacebookOAuthReturnPending {
  /** Router path (+ search) to reopen after Facebook (consent UI or cancel). */
  resumePath: string;
  purpose: 'signIn' | 'link';
  rememberMe?: boolean;
  language?: Lang;
  /** Closed allowlist for /login post-success navigation. */
  authReturnTo?: AuthReturnTo;
  /** Direct browser-OAuth CSRF nonce. FB.login manages its own SDK state. */
  oauthState?: string;
}

export function createFacebookOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function beginFacebookOAuthReturn(pending: FacebookOAuthReturnPending): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    sessionStorage.removeItem(LEGACY_PENDING_KEY);
  } catch {
    // Private mode / quota — redirect return just won't restore context.
  }
}

export function takeFacebookOAuthReturnPending(): FacebookOAuthReturnPending | null {
  try {
    const raw = takeSessionKey(PENDING_KEY, LEGACY_PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(LEGACY_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FacebookOAuthReturnPending;
    if (!parsed?.resumePath || (parsed.purpose !== 'signIn' && parsed.purpose !== 'link')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Absolute URI registered in Meta “Valid OAuth Redirect URIs”. */
export function facebookOauthReturnUrl(): string | undefined {
  return shopConfig.facebookOauthReturnUrl;
}

/** Facebook's regular web OAuth URL. Mobile browsers render this page
 * themselves instead of entering the JS SDK's native-app WebView flow. */
export function facebookBrowserOAuthUrl(oauthState: string): string | undefined {
  const appId = shopConfig.facebookAppId;
  const redirectUri = facebookOauthReturnUrl();
  if (!appId || !redirectUri) return undefined;

  const url = new URL(`https://www.facebook.com/${FACEBOOK_OAUTH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', 'public_profile,email');
  url.searchParams.set('state', oauthState);
  return url.toString();
}

/** The JS SDK's touch dialog is the path that opens the blank native
 * Facebook WebView on affected Android devices. */
export function isFacebookMobileBrowser(): boolean {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Options for FB.login — includes fallback_redirect_uri when configured. */
export function facebookLoginDialogOptions(): {
  scope: string;
  return_scopes: boolean;
  fallback_redirect_uri?: string;
} {
  const fallback = facebookOauthReturnUrl();
  return {
    scope: 'public_profile,email',
    return_scopes: true,
    ...(fallback ? { fallback_redirect_uri: fallback } : {}),
  };
}

export function stashFacebookLinkAccessToken(accessToken: string): void {
  // The return page and account page live in the same SPA document. Keep the
  // provider credential in memory for that one navigation rather than in
  // sessionStorage, where any later XSS could recover it until consumed.
  pendingFacebookLinkAccessToken = accessToken;
}

export function takeFacebookLinkAccessToken(): string | null {
  const token = pendingFacebookLinkAccessToken;
  pendingFacebookLinkAccessToken = null;
  return token?.trim() || null;
}

/** Reads access_token / error from the Facebook redirect URL (hash or query). */
export function parseFacebookRedirectResponse(href: string = window.location.href): {
  accessToken: string | null;
  denied: boolean;
  errorMessage: string | null;
  oauthState: string | null;
} {
  let params: URLSearchParams;
  try {
    const url = new URL(href);
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    params = new URLSearchParams(hash || url.search.slice(1));
  } catch {
    return { accessToken: null, denied: false, errorMessage: null, oauthState: null };
  }
  const accessToken = params.get('access_token')?.trim() || null;
  const error = params.get('error');
  const errorReason = params.get('error_reason');
  const denied =
    error === 'access_denied' || errorReason === 'user_denied' || params.get('error_code') === '200';
  const errorMessage = error && !denied ? error : null;
  return { accessToken, denied, errorMessage, oauthState: params.get('state')?.trim() || null };
}

/** Strip Facebook’s fragment/query so a refresh doesn’t re-process the token. */
export function clearFacebookRedirectResidue(): void {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}`);
}
