import { test, expect } from 'patchright/test';
import { apiJson, enableAllShopPaymentMethods, registerUser } from '../../support/api.js';

type Courier = { code: string; countries: string[]; networks: string[] };
type Cart = { id: string; name: string; isActive: boolean };

test.describe('API account preferences and carts', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('language, appearance, notifications, courier and PayPal preferences: persist and enforce their side effects', async ({
    request,
  }) => {
    const { accessToken } = await registerUser(request);

    await apiJson(request, 'PUT', '/account/preferences/language', {
      token: accessToken,
      data: { language: 'en' },
      expectedStatus: 200,
    });
    await apiJson(request, 'PUT', '/account/preferences/theme', {
      token: accessToken,
      data: { theme: 'dark' },
      expectedStatus: 200,
    });
    const { body: theme } = await apiJson(request, 'GET', '/account/preferences/theme', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((theme as { theme?: string | null }).theme).toBe('dark');
    await apiJson(request, 'PUT', '/account/preferences/contrast', {
      token: accessToken,
      data: { contrast: 'more' },
      expectedStatus: 200,
    });
    const { body: contrast } = await apiJson(request, 'GET', '/account/preferences/contrast', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((contrast as { contrast?: string | null }).contrast).toBe('more');
    await apiJson(request, 'PUT', '/account/preferences/contrast', {
      token: accessToken,
      data: { contrast: 'invalid' },
      expectedStatus: 400,
    });
    const { body: onboardingUnset } = await apiJson(request, 'GET', '/account/preferences/onboarding', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((onboardingUnset as { completed?: boolean }).completed).toBe(false);
    await apiJson(request, 'PUT', '/account/preferences/onboarding', {
      token: accessToken,
      data: { completed: false },
      expectedStatus: 400,
    });
    await apiJson(request, 'PUT', '/account/preferences/onboarding', {
      token: accessToken,
      data: { completed: true },
      expectedStatus: 200,
    });
    const { body: onboardingSet } = await apiJson(request, 'GET', '/account/preferences/onboarding', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((onboardingSet as { completed?: boolean }).completed).toBe(true);
    await apiJson(request, 'PUT', '/account/preferences/onboarding', {
      token: accessToken,
      data: { completed: true },
      expectedStatus: 200,
    });
    const { body: initialNotifications } = await apiJson(
      request,
      'GET',
      '/account/notification-preferences',
      {
        token: accessToken,
        expectedStatus: 200,
      },
    );
    expect(initialNotifications.success).toBe(true);
    const { body: notifications } = await apiJson(request, 'PUT', '/account/notification-preferences', {
      token: accessToken,
      data: { channel: 'nouveautes', enabled: false },
      expectedStatus: 200,
    });
    expect((notifications as { marketing?: { nouveautes?: boolean } }).marketing?.nouveautes).toBe(false);

    const { body: courierBody } = await apiJson(request, 'GET', '/account/couriers', { expectedStatus: 200 });
    const courier = ((courierBody as { couriers?: Courier[] }).couriers ?? []).find(
      (entry) => entry.countries.includes('FR') && entry.networks.length > 0,
    );
    expect(courier).toBeTruthy();

    await apiJson(request, 'PUT', '/account/default-courier', {
      token: accessToken,
      data: { courierCode: courier!.code },
      expectedStatus: 200,
    });
    const { body: defaultCourier } = await apiJson(request, 'GET', '/account/default-courier', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((defaultCourier as { courierCode?: string | null }).courierCode).toBe(courier!.code);

    await apiJson(request, 'POST', '/account/disabled-couriers', {
      token: accessToken,
      data: { courierCode: courier!.code },
      expectedStatus: 200,
    });
    const { body: disabled } = await apiJson(request, 'GET', '/account/disabled-couriers', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((disabled as { courierCodes?: string[] }).courierCodes).toContain(courier!.code);
    const { body: clearedDefault } = await apiJson(request, 'GET', '/account/default-courier', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((clearedDefault as { courierCode?: string | null }).courierCode).toBeNull();
    await apiJson(request, 'DELETE', `/account/disabled-couriers/${encodeURIComponent(courier!.code)}`, {
      token: accessToken,
      expectedStatus: 200,
    });

    await apiJson(request, 'PUT', '/account/payment-methods/default', {
      token: accessToken,
      data: { type: 'paypal' },
      expectedStatus: 200,
    });
    await apiJson(request, 'PUT', '/account/payment-methods/paypal-enabled', {
      token: accessToken,
      data: { enabled: false },
      expectedStatus: 200,
    });
    const { body: payments } = await apiJson(request, 'GET', '/account/payment-methods', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((payments as { paypalEnabled?: boolean }).paypalEnabled).toBe(false);
    expect((payments as { defaultPaymentMethod?: unknown }).defaultPaymentMethod).toBeNull();
  });

  test('guest-cart import: keeps the cart line and checkout selection through cart activation and rename', async ({
    request,
  }) => {
    const { accessToken } = await registerUser(request);
    const { body: feed } = await apiJson(request, 'GET', '/gallery/feed?limit=20', { expectedStatus: 200 });
    const item = (
      (
        feed as {
          items?: Array<{
            id: string;
            shape: Record<string, string>;
            lengthsByShape: Record<string, Record<string, string>>;
            available: Record<string, Record<string, Record<string, number>>>;
          }>;
        }
      ).items ?? []
    ).find((candidate) => Object.keys(candidate.shape).length > 0);
    expect(item).toBeTruthy();
    const shapeKey = Object.keys(item!.shape)[0]!;
    const lengthKey = Object.keys(item!.lengthsByShape[shapeKey] ?? {})[0]!;
    const size = (['M', 'S', 'L', 'XS'] as const).find(
      (candidate) => (item!.available[shapeKey]?.[lengthKey]?.[candidate] ?? 0) > 0,
    );
    expect(size).toBeTruthy();

    const { body: addressCreated } = await apiJson(request, 'POST', '/account/addresses', {
      token: accessToken,
      data: {
        kind: 'livraison',
        recipientName: 'Guest import',
        line1: '1 rue du Panier',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        networkCodes: ['home'],
      },
      expectedStatus: 201,
    });
    const addressId = (addressCreated as { address?: { id?: string } }).address?.id;
    expect(addressId).toBeTruthy();
    const { body: courierBody } = await apiJson(request, 'GET', '/account/couriers', { expectedStatus: 200 });
    const courierCode = ((courierBody as { couriers?: Courier[] }).couriers ?? []).find(
      (courier) => courier.countries.includes('FR') && courier.networks.includes('home'),
    )?.code;
    expect(courierCode).toBeTruthy();

    const { body: imported } = await apiJson(request, 'POST', '/account/carts/import-guest', {
      token: accessToken,
      data: {
        mode: 'new',
        name: 'Panier invité récupéré',
        items: [{ productId: item!.id, shapeKey, lengthKey, size, quantity: 1 }],
        selection: { addressId, courierCode, express: false, sameAsBilling: true },
      },
      expectedStatus: 200,
    });
    const importedCart = (imported as { cart?: Cart }).cart;
    expect(importedCart?.name).toBe('Panier invité récupéré');
    expect(importedCart?.isActive).toBe(true);

    const { body: selection } = await apiJson(request, 'GET', '/account/checkout/selection', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((selection as { addressId?: string | null }).addressId).toBe(addressId);
    expect((selection as { courierCode?: string | null }).courierCode).toBe(courierCode);
    const { body: cart } = await apiJson(request, 'GET', '/account/cart', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(
      ((cart as { items?: Array<{ productId: string; quantity: number }> }).items ?? []).some(
        (line) => line.productId === item!.id && line.quantity === 1,
      ),
    ).toBe(true);

    await apiJson(request, 'PATCH', `/account/carts/${importedCart!.id}`, {
      token: accessToken,
      data: { name: 'Panier réconcilié' },
      expectedStatus: 200,
    });
    const { body: carts } = await apiJson(request, 'GET', '/account/carts', {
      token: accessToken,
      expectedStatus: 200,
    });
    const active = ((carts as { carts?: Cart[] }).carts ?? []).find((candidate) => candidate.isActive);
    expect(active?.id).toBe(importedCart!.id);
    expect(active?.name).toBe('Panier réconcilié');
  });
});
