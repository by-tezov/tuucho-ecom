import { test, expect } from 'patchright/test';

test.describe('API Stripe webhook', () => {
  test('unsigned event: it is rejected without exposing provider internals', async ({ request }) => {
    const response = await request.post('/webhooks/stripe', {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'stripe-signature': 'not-a-valid-signature',
      },
      data: JSON.stringify({
        id: 'evt_test_unsigned',
        type: 'payment_intent.succeeded',
        data: { object: {} },
      }),
    });

    // Disposable test stacks always configure Stripe + the webhook secret, so
    // a forged signature must be a hard 400 — never 501 "not configured", and
    // never an uncaught 500 that would surface Stripe's verification Error.
    expect(response.status()).toBe(400);
    const raw = await response.text();
    expect(raw).toBe(JSON.stringify({ success: false, error: { code: 'invalid_signature' } }));
    expect(raw).not.toMatch(/Stripe|signature verification|stack|evt_test_unsigned|Unable to extract/i);
  });
});
