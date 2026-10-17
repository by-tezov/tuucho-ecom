const CHECKOUT_PRIVACY_TOKEN_STORAGE_KEY = 'psn-checkout-privacy-token-v1';
export const CHECKOUT_PRIVACY_SESSION_REJECTED_EVENT = 'pamsurin:checkout-privacy-session-rejected';
// Token rejected but not because of real 30-minute idle expiry (audience
// changed across a login/logout boundary, or no token at all) — reset
// silently, no "session expired" notice.
export const CHECKOUT_PRIVACY_SESSION_AUDIENCE_CHANGED_EVENT =
  'pamsurin:checkout-privacy-session-audience-changed';

export function getCheckoutPrivacyToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(CHECKOUT_PRIVACY_TOKEN_STORAGE_KEY);
}

export function setCheckoutPrivacyToken(token: string): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(CHECKOUT_PRIVACY_TOKEN_STORAGE_KEY, token);
  }
}

export function clearCheckoutPrivacyToken(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(CHECKOUT_PRIVACY_TOKEN_STORAGE_KEY);
  }
}

export function announceCheckoutPrivacySessionRejected(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHECKOUT_PRIVACY_SESSION_REJECTED_EVENT));
  }
}

export function announceCheckoutPrivacySessionAudienceChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHECKOUT_PRIVACY_SESSION_AUDIENCE_CHANGED_EVENT));
  }
}
