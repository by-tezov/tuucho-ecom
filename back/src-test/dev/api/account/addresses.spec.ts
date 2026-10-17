import { test, expect } from 'patchright/test';
import { apiJson, registerUser } from '../../support/api.js';

test.describe('API addresses', () => {
  test('home livraison address: it can be added, listed, updated, and removed', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    const { body: created } = await apiJson(request, 'POST', '/account/addresses', {
      token: accessToken,
      data: {
        kind: 'livraison',
        label: 'Maison',
        recipientName: 'Ada Lovelace',
        line1: '10 rue de Test',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        phone: '+33601020304',
        networkCodes: ['home'],
        isDefault: true,
      },
      expectedStatus: [200, 201],
    });
    const addressId =
      (created as { address?: { id: string }; id?: string }).address?.id ??
      (created as { id?: string }).id;
    expect(addressId).toBeTruthy();

    const { body: list } = await apiJson(request, 'GET', '/account/addresses', {
      token: accessToken,
      expectedStatus: 200,
    });
    const addresses = (list as { addresses?: unknown[] }).addresses ?? list;
    expect(Array.isArray(addresses) ? addresses.length : 1).toBeGreaterThan(0);

    await apiJson(request, 'PATCH', `/account/addresses/${addressId}`, {
      token: accessToken,
      data: { label: 'Maison 2', line1: '12 rue de Test' },
      expectedStatus: 200,
    });

    await apiJson(request, 'DELETE', `/account/addresses/${addressId}`, {
      token: accessToken,
      expectedStatus: [200, 204],
    });
  });

  test('keeps Mondial Relay pickup metadata on a one-time address but: hides it from the saved address book', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { body: created } = await apiJson(request, 'POST', '/account/addresses', {
      token: accessToken,
      data: {
        kind: 'livraison',
        label: 'Point relais ponctuel',
        recipientName: 'Ada Lovelace',
        line1: '12 rue de la Poste',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        networkCodes: ['mondial-relay-point'],
        pickupPoints: {
          'mondial-relay-point': {
            id: 'FR-75001-TEST',
            metadata: { name: 'Relais E2E', city: 'Paris' },
          },
        },
        savedForFuture: false,
      },
      expectedStatus: 201,
    });
    const address = (created as {
      address?: { id?: string; savedForFuture?: boolean; pickupPoints?: Record<string, { id?: string }> };
    }).address;
    expect(address?.id).toBeTruthy();
    expect(address?.savedForFuture).toBe(false);
    expect(address?.pickupPoints?.['mondial-relay-point']?.id).toBe('FR-75001-TEST');

    const { body: list } = await apiJson(request, 'GET', '/account/addresses', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(((list as { addresses?: Array<{ id: string }> }).addresses ?? [])
      .some((candidate) => candidate.id === address!.id)).toBe(false);

    const { body: fetched } = await apiJson(request, 'GET', `/account/addresses/${address!.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((fetched as { address?: { pickupPoints?: Record<string, { id?: string }> } })
      .address?.pickupPoints?.['mondial-relay-point']?.id).toBe('FR-75001-TEST');
  });
});
