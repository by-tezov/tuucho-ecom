const KEY = 'psn-checkout-guest-draft';

export type GuestCheckoutPromptView = 'signup' | 'login' | 'otp' | 'consent';
export type GuestCheckoutPendingConsent = 'password' | 'otp';

export interface GuestCheckoutDraft {
  email: string;
  consent: boolean;
  /** Identification card step — survives terms/privacy remounts. */
  view?: GuestCheckoutPromptView;
  /** Login view in passwordless (OTP) shape. */
  passwordlessLogin?: boolean;
  /** Account-create CGU step after login/OTP without consent (like social needsConsent). */
  pendingAfterConsent?: GuestCheckoutPendingConsent;
}

const EMPTY: GuestCheckoutDraft = { email: '', consent: false };

/** What a signed-out shopper has typed into the cart's sign-in card
 * (components/cart/GuestCheckoutPrompt.tsx). sessionStorage for the same
 * reason as ephemeralAddresses: leaving /cart for the terms/privacy pages —
 * or for the Mondial Relay picker — remounts the card, and retyping an
 * address just to read the CGU you were asked to accept is the kind of thing
 * that ends a checkout. Never a password: only the email, the guest-checkout
 * consent checkbox, and which Identification step was open. Cleared on
 * sign-in and after a successful guest order. */
export function loadGuestCheckoutDraft(): GuestCheckoutDraft {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<GuestCheckoutDraft>;
    const view =
      parsed.view === 'signup' ||
      parsed.view === 'login' ||
      parsed.view === 'otp' ||
      parsed.view === 'consent'
        ? parsed.view
        : undefined;
    const pendingAfterConsent =
      parsed.pendingAfterConsent === 'password' || parsed.pendingAfterConsent === 'otp'
        ? parsed.pendingAfterConsent
        : undefined;
    return {
      email: typeof parsed.email === 'string' ? parsed.email : '',
      consent: parsed.consent === true,
      passwordlessLogin: parsed.passwordlessLogin === true,
      ...(view ? { view } : {}),
      ...(pendingAfterConsent ? { pendingAfterConsent } : {}),
    };
  } catch {
    return EMPTY;
  }
}

export function saveGuestCheckoutDraft(draft: GuestCheckoutDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private-mode / quota failures must never break the checkout form.
  }
}

export function clearGuestCheckoutDraft(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(KEY);
}
