import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/config/env', () => ({
  shopConfig: { guestStorageRetentionMs: 30 * 86_400_000 },
}));
import {
  clearGuestCards,
  loadGuestAddressState,
  loadGuestCards,
  lockGuestCheckoutVault,
  saveGuestAddressState,
  saveGuestCards,
  unlockGuestCheckoutVaultWithServerKey,
} from '../../../src/state/guestCardVault';
import { addEphemeralAddress, loadEphemeralAddresses } from '../../../src/state/ephemeralAddresses';
import { addEphemeralCard, loadEphemeralCards } from '../../../src/state/ephemeralCards';
import { lockCheckoutVault, unlockCheckoutVaultWithServerKey } from '../../../src/state/checkoutEphemeralVault';
import { clearGuestCheckoutAfterOrder } from '../../../src/state/guestCheckoutCompletion';
import { loadGuestState, saveGuestState } from '../../../src/state/guestCart';
import { loadGuestCheckoutDraft, saveGuestCheckoutDraft } from '../../../src/state/guestCheckoutDraft';

const serverKey = window.btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)));

afterEach(() => {
  clearGuestCards();
  lockGuestCheckoutVault();
  lockCheckoutVault();
});

describe('guest checkout vault', () => {
  it('restores an address and card after the in-memory key is re-imported', async () => {
    await unlockGuestCheckoutVaultWithServerKey(serverKey);
    await saveGuestCards({
      paymentMethods: [
        {
          id: 'pm_session_test',
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2032,
          cardholderName: 'Ada Lovelace',
          savedForFuture: false,
        },
      ],
      defaultPaymentMethod: { type: 'card', id: 'pm_session_test' },
    });
    await saveGuestAddressState({
      addresses: [
        {
          id: 'guest-address-session-test',
          kind: 'livraison',
          label: 'Temporary',
          recipientName: 'Ada Lovelace',
          companyName: null,
          line1: '10 rue de Test',
          line2: null,
          deliveryNotes: null,
          postalCode: '75001',
          city: 'Paris',
          countryCode: 'FR',
          phone: '+33601020304',
          networkCodes: ['home'],
          pickupPoints: {},
          isDefault: false,
          savedForFuture: false,
        },
      ],
      selectedAddressId: 'guest-address-session-test',
      sameAsBilling: true,
      selectedBillingAddressId: null,
    });

    expect(window.sessionStorage.getItem('psn-guest-card-vault-v1')).toBeTruthy();
    expect(window.localStorage.getItem('psn-guest-card-vault-v1')).toBeNull();

    // Models F5: module memory/key is gone, while this tab's sessionStorage
    // ciphertext and server session survive.
    lockGuestCheckoutVault();
    await unlockGuestCheckoutVaultWithServerKey(serverKey);

    expect((await loadGuestCards()).paymentMethods[0]?.id).toBe('pm_session_test');
    expect((await loadGuestAddressState()).selectedAddressId).toBe('guest-address-session-test');
  });

  it('clears every completed guest checkout field after pending vault writes', async () => {
    await unlockGuestCheckoutVaultWithServerKey(serverKey);
    await unlockCheckoutVaultWithServerKey(serverKey);
    const address = {
      id: 'guest-address-completed-test',
      kind: 'livraison' as const,
      label: 'Completed checkout',
      recipientName: 'Ada Lovelace',
      companyName: null,
      line1: '10 rue de Test',
      line2: null,
      deliveryNotes: null,
      postalCode: '75001',
      city: 'Paris',
      countryCode: 'FR',
      phone: '+33601020304',
      networkCodes: ['home'],
      pickupPoints: {},
      isDefault: false,
      savedForFuture: false,
    };
    const card = {
      id: 'pm_completed_test',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2032,
      cardholderName: 'Ada Lovelace',
      savedForFuture: false,
    };
    saveGuestState({
      cart: [
        {
          productId: 'product-completed-test',
          shapeKey: 'almond',
          lengthKey: 'medium',
          size: 'M',
          packKey: '',
          quantity: 1,
        },
      ],
      favorites: { 'product-favourite-test': 'almond::medium' },
      courierCode: 'mondial-relay-home',
      express: true,
      voucherCode: 'COMPLETED',
    });
    saveGuestCheckoutDraft({ email: 'guest@example.test', consent: true });
    addEphemeralAddress(address);
    addEphemeralCard(card);

    // Model the real race: address/card encryption accepted just before the
    // successful-order callback must not restore the old checkout afterward.
    const cardWrite = saveGuestCards({
      paymentMethods: [card, { ...card, id: 'pm_remembered_test', savedForFuture: true }],
      defaultPaymentMethod: { type: 'card', id: card.id },
    });
    const addressWrite = saveGuestAddressState({
      addresses: [address, { ...address, id: 'guest-address-remembered-test', savedForFuture: true }],
      selectedAddressId: address.id,
      sameAsBilling: true,
      selectedBillingAddressId: null,
    });

    await clearGuestCheckoutAfterOrder();
    await Promise.all([cardWrite, addressWrite]);

    expect(loadGuestState()).toMatchObject({
      cart: [],
      favorites: { 'product-favourite-test': 'almond::medium' },
      courierCode: null,
      express: false,
      voucherCode: null,
    });
    expect(loadGuestCheckoutDraft()).toEqual({ email: '', consent: false });
    expect(await loadGuestCards()).toEqual({ paymentMethods: [], defaultPaymentMethod: null });
    expect(await loadGuestAddressState()).toEqual({
      addresses: [],
      selectedAddressId: null,
      sameAsBilling: true,
      selectedBillingAddressId: null,
    });
    expect(loadEphemeralAddresses()).toEqual([]);
    expect(loadEphemeralCards()).toEqual([]);
  });
});
