import { test, expect } from 'patchright/test';
import { apiJson } from '../support/api.js';

test.describe('API public metadata surfaces', () => {
  test('sign-in methods: expose a complete boolean capability matrix', async ({ request }) => {
    const { body } = await apiJson<{
      success: boolean;
      signInMethods?: Record<string, unknown>;
    }>(request, 'GET', '/auth/sign-in-methods', { expectedStatus: 200 });

    expect(body.success).toBe(true);
    for (const key of [
      'google',
      'facebook',
      'apple',
      'googleVerbose',
      'facebookVerbose',
      'appleVerbose',
    ]) {
      expect(typeof body.signInMethods?.[key]).toBe('boolean');
    }
  });

  test('phone countries: are the unique union of enabled shipping countries', async ({ request }) => {
    const { body } = await apiJson<{
      success: boolean;
      countries?: Array<{ code: string; label: string }>;
    }>(request, 'GET', '/account/phone-countries', { expectedStatus: 200 });

    expect(body.success).toBe(true);
    const countries = body.countries ?? [];
    expect(countries.length).toBeGreaterThan(0);
    expect(new Set(countries.map((country) => country.code)).size).toBe(countries.length);
    expect(countries.every((country) => /^[A-Z]{2}$/.test(country.code) && country.label.trim())).toBe(true);
  });

  test('checkout payment metadata: exposes every supported shop method', async ({ request }) => {
    const { body } = await apiJson<{
      success: boolean;
      shopPaymentMethods?: Record<string, unknown>;
    }>(request, 'GET', '/checkout/payment-methods', { expectedStatus: 200 });

    expect(body.success).toBe(true);
    for (const key of ['card', 'paypal', 'bancontact', 'googlePay', 'applePay']) {
      expect(typeof body.shopPaymentMethods?.[key]).toBe('boolean');
    }
  });
});
