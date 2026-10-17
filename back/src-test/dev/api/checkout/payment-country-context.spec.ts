import { test, expect } from 'patchright/test';
import {
  apiJson,
  createAddress,
  createBeHomeAddress,
  createBePickupAddress,
  enableAllShopPaymentMethods,
  pickPurchasableVariant,
  registerUser,
} from '../../support/api.js';

test.describe('API checkout payment country context', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  async function seedPaidCart(
    request: import('patchright/test').APIRequestContext,
    accessToken: string,
    addressId: string,
    courierCode: string,
  ) {
    const variant = await pickPurchasableVariant(request, { token: accessToken });
    await apiJson(request, 'POST', '/account/cart', {
      token: accessToken,
      data: {
        productId: variant.productId,
        shapeKey: variant.shapeKey,
        lengthKey: variant.lengthKey,
        size: variant.size,
        quantity: 1,
      },
      expectedStatus: 200,
    });
    return { variant, intentBody: { addressId, courierCode, express: false, method: 'bancontact' as const } };
  }

  test('Bancontact create-intent: accepts FR home delivery (overflow still payable)', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const address = await createAddress(request, accessToken);
    const { intentBody } = await seedPaidCart(request, accessToken, address.id, 'colissimo-home');
    const { body } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      { token: accessToken, data: intentBody, expectedStatus: 200 },
    );
    expect(body.clientSecret).toMatch(/_secret_/);
  });

  test('Bancontact create-intent: accepts BE home delivery', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const address = await createBeHomeAddress(request, accessToken);
    const { intentBody } = await seedPaidCart(request, accessToken, address.id, 'colissimo-home');
    const { body } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      { token: accessToken, data: intentBody, expectedStatus: 200 },
    );
    expect(body.clientSecret).toMatch(/_secret_/);
  });

  test('Bancontact create-intent: accepts BE pickup delivery', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const address = await createBePickupAddress(request, accessToken);
    const { intentBody } = await seedPaidCart(request, accessToken, address.id, 'mondial-relay-point');
    const { body } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      { token: accessToken, data: intentBody, expectedStatus: 200 },
    );
    expect(body.clientSecret).toMatch(/_secret_/);
  });
});
