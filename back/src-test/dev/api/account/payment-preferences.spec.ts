import { test, expect } from 'patchright/test';
import {
  apiJson,
  enableAllShopPaymentMethods,
  setShopPaymentMethods,
  registerUser,
} from '../../support/api.js';

type PaymentMethods = {
  paymentMethods?: Array<{ id: string }>;
  defaultPaymentMethod?: { type: string; id?: string } | null;
  paypalEnabled?: boolean;
  bancontactEnabled?: boolean;
  googlePayEnabled?: boolean;
  applePayEnabled?: boolean;
  shopPaymentMethods?: {
    card?: boolean;
    paypal?: boolean;
    bancontact?: boolean;
    googlePay?: boolean;
    applePay?: boolean;
  };
};

/** PayPal and the two wallets are account preferences, not saved Stripe
 * payment methods, so their whole lifecycle is testable without Stripe. */
test.describe('API payment preferences', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('wallet: toggles default to enabled and clear a matching default', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    const { body: initial } = await apiJson<PaymentMethods>(request, 'GET', '/account/payment-methods', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(initial.paymentMethods).toEqual([]);
    expect(initial.defaultPaymentMethod).toBeNull();
    // Every method is on until the customer explicitly opts out.
    expect(initial.paypalEnabled).toBe(true);
    expect(initial.bancontactEnabled).toBe(true);
    expect(initial.googlePayEnabled).toBe(true);
    expect(initial.applePayEnabled).toBe(true);
    expect(initial.shopPaymentMethods).toEqual({
      card: true,
      paypal: true,
      bancontact: true,
      googlePay: true,
      applePay: true,
    });

    const wallets = [
      { type: 'paypal', route: 'paypal-enabled', flag: 'paypalEnabled' },
      { type: 'bancontact', route: 'bancontact-enabled', flag: 'bancontactEnabled' },
      { type: 'google_pay', route: 'google-pay-enabled', flag: 'googlePayEnabled' },
      { type: 'apple_pay', route: 'apple-pay-enabled', flag: 'applePayEnabled' },
    ] as const;

    for (const wallet of wallets) {
      await apiJson(request, 'PUT', `/account/payment-methods/${wallet.route}`, {
        token: accessToken,
        data: { enabled: 'yes' },
        expectedStatus: 400,
      });

      // Make this wallet the default, then opt out of it: the default must
      // not survive as an unusable choice.
      const { body: chosen } = await apiJson<{ defaultPaymentMethod?: { type: string } }>(
        request,
        'PUT',
        '/account/payment-methods/default',
        { token: accessToken, data: { type: wallet.type }, expectedStatus: 200 },
      );
      expect(chosen.defaultPaymentMethod?.type).toBe(wallet.type);

      const { body: disabled } = await apiJson<Record<string, unknown>>(
        request,
        'PUT',
        `/account/payment-methods/${wallet.route}`,
        { token: accessToken, data: { enabled: false }, expectedStatus: 200 },
      );
      expect(disabled[wallet.flag]).toBe(false);

      const { body: after } = await apiJson<PaymentMethods>(
        request,
        'GET',
        '/account/payment-methods',
        { token: accessToken, expectedStatus: 200 },
      );
      expect(after.defaultPaymentMethod).toBeNull();
      expect(after[wallet.flag]).toBe(false);

      const { body: reEnabled } = await apiJson<Record<string, unknown>>(
        request,
        'PUT',
        `/account/payment-methods/${wallet.route}`,
        { token: accessToken, data: { enabled: true }, expectedStatus: 200 },
      );
      expect(reEnabled[wallet.flag]).toBe(true);
    }

    // Disabling one wallet leaves a different wallet's default alone.
    await apiJson(request, 'PUT', '/account/payment-methods/default', {
      token: accessToken,
      data: { type: 'paypal' },
      expectedStatus: 200,
    });
    await apiJson(request, 'PUT', '/account/payment-methods/apple-pay-enabled', {
      token: accessToken,
      data: { enabled: false },
      expectedStatus: 200,
    });
    const { body: kept } = await apiJson<PaymentMethods>(request, 'GET', '/account/payment-methods', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(kept.defaultPaymentMethod).toEqual({ type: 'paypal' });
    await apiJson(request, 'PUT', '/account/payment-methods/apple-pay-enabled', {
      token: accessToken,
      data: { enabled: true },
      expectedStatus: 200,
    });
  });

  test('the default payment preference: is explicit and clearable', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    for (const badBody of [{}, { type: 'bitcoin' }, { type: 'card' }, { type: 'card', id: '' }]) {
      await apiJson(request, 'PUT', '/account/payment-methods/default', {
        token: accessToken,
        data: badBody,
        expectedStatus: 400,
      });
    }
    // A card default must actually be attached to this customer.
    const { body: unknownCard } = await apiJson<{ error?: { code?: string } }>(
      request,
      'PUT',
      '/account/payment-methods/default',
      { token: accessToken, data: { type: 'card', id: 'pm_not_mine' }, expectedStatus: 404 },
    );
    expect(unknownCard.error?.code).toBe('not_found');

    await apiJson(request, 'PUT', '/account/payment-methods/default', {
      token: accessToken,
      data: { type: 'google_pay' },
      expectedStatus: 200,
    });
    await apiJson(request, 'POST', '/account/payment-methods/unset-default', {
      token: accessToken,
      expectedStatus: 200,
    });
    const { body: cleared } = await apiJson<PaymentMethods>(request, 'GET', '/account/payment-methods', {
      token: accessToken,
      expectedStatus: 200,
    });
    // No default is a normal state here, so nothing is promoted in its place.
    expect(cleared.defaultPaymentMethod).toBeNull();

    // Clearing again stays a success.
    await apiJson(request, 'POST', '/account/payment-methods/unset-default', {
      token: accessToken,
      expectedStatus: 200,
    });
  });

  test('card routes: refuse a card this customer never attached', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    // The account has no Stripe customer yet, so nothing can be looked up,
    // deleted, or adopted by id alone.
    await apiJson(request, 'GET', '/account/payment-methods/pm_not_mine', {
      token: accessToken,
      expectedStatus: [404, 501],
    });
    await apiJson(request, 'DELETE', '/account/payment-methods/pm_not_mine', {
      token: accessToken,
      expectedStatus: [404, 501],
    });
    await apiJson(request, 'POST', '/account/payment-methods/attach', {
      token: accessToken,
      data: {},
      expectedStatus: [400, 501],
    });
    await apiJson(request, 'POST', '/account/payment-methods/register', {
      token: accessToken,
      data: {},
      expectedStatus: [400, 501],
    });
  });

  test('shop-disabled methods: are forbidden and hide the stored default', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    await apiJson(request, 'PUT', '/account/payment-methods/default', {
      token: accessToken,
      data: { type: 'paypal' },
      expectedStatus: 200,
    });

    await setShopPaymentMethods(request, { paymentPaypalEnabled: false });

    const { body: listed } = await apiJson<PaymentMethods>(request, 'GET', '/account/payment-methods', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(listed.shopPaymentMethods?.paypal).toBe(false);
    expect(listed.defaultPaymentMethod).toBeNull();

    const { body: toggleForbidden } = await apiJson<{ error?: { code?: string } }>(
      request,
      'PUT',
      '/account/payment-methods/paypal-enabled',
      { token: accessToken, data: { enabled: false }, expectedStatus: 403 },
    );
    expect(toggleForbidden.error?.code).toBe('payment_method_forbidden');

    const { body: defaultForbidden } = await apiJson<{ error?: { code?: string } }>(
      request,
      'PUT',
      '/account/payment-methods/default',
      { token: accessToken, data: { type: 'paypal' }, expectedStatus: 403 },
    );
    expect(defaultForbidden.error?.code).toBe('payment_method_forbidden');

    const { body: publicShop } = await apiJson<{
      shopPaymentMethods?: { paypal?: boolean };
    }>(request, 'GET', '/checkout/payment-methods', { expectedStatus: 200 });
    expect(publicShop.shopPaymentMethods?.paypal).toBe(false);

    await setShopPaymentMethods(request, { paymentCardEnabled: false });
    const { body: setupForbidden } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/payment-methods/setup-intent',
      { token: accessToken, expectedStatus: [403, 501] },
    );
    if (setupForbidden.error?.code) {
      expect(['payment_method_forbidden', 'stripe_not_configured']).toContain(setupForbidden.error.code);
    }
  });
});
