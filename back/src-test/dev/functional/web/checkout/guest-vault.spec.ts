import { test, expect } from '../../../support/fixtures.js';

async function seedGuestVault(page: import('patchright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  return page.evaluate(async () => {
    const { saveGuestCards, saveGuestAddressState } = await import('/src/state/guestCardVault');
    await saveGuestCards({
      paymentMethods: [
        {
          id: 'pm_guest_sensitive_test',
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2032,
          cardholderName: 'Private Cardholder',
          savedForFuture: false,
        },
      ],
      defaultPaymentMethod: { type: 'card', id: 'pm_guest_sensitive_test' },
    });
    await saveGuestAddressState({
      addresses: [
        {
          id: 'guest-private-address',
          kind: 'livraison',
          label: null,
          recipientName: 'Private Test Recipient',
          companyName: null,
          line1: '42 Confidential Street',
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
      ],
    });
    return window.sessionStorage.getItem('psn-guest-card-vault-v1');
  });
}

test.describe('Guest checkout vault', () => {
  test('web guest vault: sensitive checkout fields are stored only as ciphertext', async ({ page }) => {
    const encryptedRecord = await seedGuestVault(page);
    expect(encryptedRecord).toContain('ciphertext');
    expect(encryptedRecord).not.toContain('pm_guest_sensitive_test');
    expect(encryptedRecord).not.toContain('Private Cardholder');
    expect(encryptedRecord).not.toContain('Private Test Recipient');
    expect(encryptedRecord).not.toContain('42 Confidential Street');
  });

  test('web guest vault: closing the tab forgets cards and addresses', async ({ page }) => {
    await seedGuestVault(page);
    const context = page.context();
    // Keep a blank second tab alive: Chromium closes a persistent browser
    // context when its last page is closed, whereas a customer can still have
    // another site tab open while closing the cart tab.
    const reopenedTab = await context.newPage();
    await page.close();
    try {
      await reopenedTab.goto('/');
      const afterReopen = await reopenedTab.evaluate(async () => {
        const { loadGuestCards, loadGuestAddressState } = await import('/src/state/guestCardVault');
        return {
          cards: await loadGuestCards(),
          addressState: await loadGuestAddressState(),
          storedVault: window.sessionStorage.getItem('psn-guest-card-vault-v1'),
        };
      });
      expect(afterReopen.cards.paymentMethods).toEqual([]);
      expect(afterReopen.cards.defaultPaymentMethod).toBeNull();
      expect(afterReopen.addressState.addresses).toEqual([]);
      expect(afterReopen.storedVault).toBeNull();
    } finally {
      await reopenedTab.close();
    }
  });
});
