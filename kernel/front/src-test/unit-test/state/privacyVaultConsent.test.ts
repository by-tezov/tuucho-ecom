import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginAuthLegalDetour,
  clearAuthConsentDraft,
  endAuthLegalDetour,
  hasPendingAuthConsentDraft,
  loadAuthConsentDraft,
  patchAuthConsentDraft,
  saveAuthConsentDraft,
  shouldResumeAuthModalDraft,
  shouldResumeCartAuthDraft,
} from '@/state/authConsentDraft';
import {
  flushCheckoutVault,
  isCheckoutVaultUnlocked,
  lockCheckoutVault,
  setCheckoutEphemeralAddresses,
  setCheckoutEphemeralPaymentMethods,
  unlockCheckoutVaultWithServerKey,
} from '@/state/checkoutEphemeralVault';
import { mergeAddressLists } from '@/state/ephemeralAddresses';
import {
  CHECKOUT_SESSION_EXPIRED_NOTICE_KEY,
  initializeCheckoutPrivacySession,
  resetCheckoutPrivacySession,
} from '@/state/checkoutPrivacySession';

const serverKey = window.btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 3)));

vi.mock('@/api/checkout', () => ({
  startCheckoutPrivacySession: vi.fn(async () => ({
    token: 'tok-1',
    vaultKey: serverKey,
    idleTimeoutMs: 60_000,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    expired: false,
  })),
  touchCheckoutPrivacySession: vi.fn(async () => ({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })),
}));

afterEach(() => {
  clearAuthConsentDraft({ force: true });
  endAuthLegalDetour();
  lockCheckoutVault();
  resetCheckoutPrivacySession();
  window.sessionStorage.clear();
});

describe('authConsentDraft', () => {
  it('persists patches and protects drafts during a legal detour', () => {
    saveAuthConsentDraft({ googleSignupToken: 'g', surface: 'cart' });
    expect(shouldResumeCartAuthDraft()).toBe(true);
    expect(shouldResumeAuthModalDraft()).toBe(false);

    beginAuthLegalDetour();
    clearAuthConsentDraft();
    expect(loadAuthConsentDraft().googleSignupToken).toBe('g');
    clearAuthConsentDraft({ force: true });
    expect(loadAuthConsentDraft()).toEqual({});

    patchAuthConsentDraft({ step: 'otp', otpSent: true, surface: 'auth-modal' });
    expect(hasPendingAuthConsentDraft()).toBe(true);
    expect(shouldResumeAuthModalDraft()).toBe(true);
  });

  it('migrates a legacy session key once', () => {
    window.sessionStorage.setItem('pamsurin.authConsentDraft', JSON.stringify({ emailAuth: true }));
    expect(loadAuthConsentDraft().emailAuth).toBe(true);
    expect(window.sessionStorage.getItem('psn-auth-consent-draft-v1')).toBeTruthy();
    expect(window.sessionStorage.getItem('pamsurin.authConsentDraft')).toBeNull();
  });
});

describe('checkoutEphemeralVault', () => {
  it('persists ciphertext and restores it after a module remount with the same key', async () => {
    await unlockCheckoutVaultWithServerKey(serverKey);
    expect(isCheckoutVaultUnlocked()).toBe(true);
    setCheckoutEphemeralAddresses([
      {
        id: 'a1',
        kind: 'livraison',
        label: null,
        recipientName: 'Ada',
        companyName: null,
        line1: '1 rue',
        line2: null,
        deliveryNotes: null,
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        phone: null,
        networkCodes: ['home'],
        pickupPoints: {},
        isDefault: false,
        savedForFuture: false,
      },
    ]);
    setCheckoutEphemeralPaymentMethods([
      {
        id: 'pm_1',
        brand: 'visa',
        last4: '4242',
        expMonth: 1,
        expYear: 2030,
        cardholderName: 'Ada',
        savedForFuture: false,
      },
    ]);
    await flushCheckoutVault();
    const ciphertext = window.sessionStorage.getItem('psn-checkout-ephemeral-vault-v1');
    expect(ciphertext).toBeTruthy();

    // lockCheckoutVault wipes the blob on purpose; F5 keeps sessionStorage and
    // re-imports the module with an empty RAM key, so remount that path here.
    vi.resetModules();
    window.sessionStorage.setItem('psn-checkout-ephemeral-vault-v1', ciphertext!);
    const remounted = await import('@/state/checkoutEphemeralVault');
    await remounted.unlockCheckoutVaultWithServerKey(serverKey);
    expect(remounted.getCheckoutEphemeralPlain().addresses[0]?.id).toBe('a1');
    expect(remounted.getCheckoutEphemeralPlain().paymentMethods[0]?.id).toBe('pm_1');
    remounted.lockCheckoutVault();
    expect(window.sessionStorage.getItem('psn-checkout-ephemeral-vault-v1')).toBeNull();
  });
});

describe('mergeAddressLists', () => {
  it('lets saved addresses win on id collisions', () => {
    const merged = mergeAddressLists(
      [{ id: '1', line1: 'saved' } as never],
      [{ id: '1', line1: 'ephemeral' } as never, { id: '2', line1: 'only-ephemeral' } as never],
    );
    expect(merged.map((address) => address.line1)).toEqual(['saved', 'only-ephemeral']);
  });
});

describe('checkoutPrivacySession', () => {
  it('unlocks vaults from the server session and reset clears sensitive stores', async () => {
    await initializeCheckoutPrivacySession('access');
    expect(isCheckoutVaultUnlocked()).toBe(true);
    setCheckoutEphemeralPaymentMethods([
      {
        id: 'pm_privacy',
        brand: 'visa',
        last4: '1111',
        expMonth: 2,
        expYear: 2031,
        cardholderName: 'Ada',
        savedForFuture: false,
      },
    ]);
    await flushCheckoutVault();
    resetCheckoutPrivacySession();
    expect(isCheckoutVaultUnlocked()).toBe(false);
    expect(window.sessionStorage.getItem('psn-checkout-ephemeral-vault-v1')).toBeNull();
    expect(window.sessionStorage.getItem(CHECKOUT_SESSION_EXPIRED_NOTICE_KEY)).toBeNull();
  });
});
