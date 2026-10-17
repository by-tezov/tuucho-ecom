import { expect, test } from '@playwright/test';

test('guest address is encrypted and cannot survive a page reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());

  const encryptedRecord = await page.evaluate(async () => {
    const { saveGuestAddressState } = await import('/src/state/guestCardVault.ts');
    await saveGuestAddressState({
      addresses: [
        {
          id: 'test-private-address',
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
    return window.localStorage.getItem('psn-guest-card-vault-v1');
  });

  expect(encryptedRecord).toContain('ciphertext');
  expect(encryptedRecord).not.toContain('Private Test Recipient');
  expect(encryptedRecord).not.toContain('42 Confidential Street');

  await page.reload();
  const afterReload = await page.evaluate(async () => {
    const { loadGuestAddressState } = await import('/src/state/guestCardVault.ts');
    const addressState = await loadGuestAddressState();
    return { addressState, storedVault: window.localStorage.getItem('psn-guest-card-vault-v1') };
  });

  expect(afterReload.addressState.addresses).toEqual([]);
  expect(afterReload.storedVault).toBeNull();
});
