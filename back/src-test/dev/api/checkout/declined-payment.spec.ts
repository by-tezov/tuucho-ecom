import Stripe from 'stripe';
import { test, expect } from 'patchright/test';
import { loadStripeSecretKey } from '../../../../scripts/envFile.js';
import {
  apiJson,
  createAddress,
  enableAllShopPaymentMethods,
  pickPurchasableVariant,
  registerUser,
  testCourierCode,
  uniqueEmail,
} from '../../support/api.js';
import { loadTestEnv } from '../../support/env.js';
import { initVoucher } from '../../support/ops.js';

/** A declined card is the one checkout outcome the browser learns before any
 * webhook can: `release-failed` is what hands the reserved stock back
 * immediately instead of waiting out the reservation TTL. */
test.describe('API declined payment release', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });
  test('an authenticated decline: releases its own reservation and only its own', async ({ request }) => {
    const env = loadTestEnv();
    const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
    if (!stripeSecretKey) throw new Error('The declined-payment API test requires STRIPE_SECRET_KEY.');
    const stripe = new Stripe(stripeSecretKey);

    const { accessToken } = await registerUser(request);
    const address = await createAddress(request, accessToken);
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

    await apiJson(request, 'POST', '/account/checkout/release-failed', {
      token: accessToken,
      data: {},
      expectedStatus: 400,
    });

    // A card that attaches cleanly but fails at charge time — the exact
    // shape this endpoint exists for.
    const { body: setup } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/payment-methods/setup-intent',
      { token: accessToken, expectedStatus: 200 },
    );
    const setupIntentId = setup.clientSecret!.split('_secret_')[0]!;
    const card = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_chargeCustomerFail' },
      billing_details: { name: 'Ada Lovelace' },
    });
    const confirmedSetup = await stripe.setupIntents.confirm(setupIntentId, { payment_method: card.id });
    expect(confirmedSetup.status).toBe('succeeded');
    await apiJson(request, 'POST', '/account/payment-methods/register', {
      token: accessToken,
      data: { paymentMethodId: card.id, savedForFuture: false },
      expectedStatus: 200,
    });

    const voucherCreated = await initVoucher(
      `e2e-decline-${Date.now()}`,
      { kind: 'percent', percent: 10 },
      { quantity: 1 },
    );
    const voucherCode =
      (voucherCreated as { voucher?: { code?: string }; code?: string }).voucher?.code ??
      (voucherCreated as { code?: string }).code;
    expect(voucherCode).toBeTruthy();

    const { body: intent } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: accessToken,
        data: {
          addressId: address.id,
          courierCode: testCourierCode,
          express: false,
          paymentMethodId: card.id,
          voucherCode,
        },
        expectedStatus: 200,
      },
    );
    const paymentIntentId = intent.clientSecret!.split('_secret_')[0]!;

    // Stripe raises on a decline; the intent is left waiting for another
    // payment method, which is what the front reports back here.
    await expect(
      stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: card.id,
        return_url: `${env.frontBaseUrl}/cart`,
      }),
    ).rejects.toThrow();
    const declined = await stripe.paymentIntents.retrieve(paymentIntentId);
    expect(declined.status).toBe('requires_payment_method');
    expect(declined.last_payment_error).toBeTruthy();

    // Another customer knows nothing about this intent.
    const stranger = await registerUser(request);
    const { body: notMine } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/checkout/release-failed',
      { token: stranger.accessToken, data: { paymentIntentId }, expectedStatus: 404 },
    );
    expect(notMine.error?.code).toBe('not_found');

    await apiJson(request, 'POST', '/account/checkout/release-failed', {
      token: accessToken,
      data: { paymentIntentId },
      expectedStatus: 200,
    });
    // The webhook is the durable fallback for the same event, so releasing
    // twice must stay idempotent rather than erroring.
    await apiJson(request, 'POST', '/account/checkout/release-failed', {
      token: accessToken,
      data: { paymentIntentId },
      expectedStatus: 200,
    });

    // The exact reservation release must also free a finite voucher hold;
    // otherwise a declined checkout would consume the code until its TTL.
    const strangerAddress = await createAddress(request, stranger.accessToken);
    await apiJson(request, 'POST', '/account/cart', {
      token: stranger.accessToken,
      data: {
        productId: variant.productId,
        shapeKey: variant.shapeKey,
        lengthKey: variant.lengthKey,
        size: variant.size,
        quantity: 1,
      },
      expectedStatus: 200,
    });
    const { body: voucherValidation } = await apiJson<{ voucher?: { code?: string } }>(
      request,
      'POST',
      '/account/checkout/voucher/validate',
      {
        token: stranger.accessToken,
        data: { addressId: strangerAddress.id, code: voucherCode, courierCode: testCourierCode, express: false },
        expectedStatus: 200,
      },
    );
    expect(voucherValidation.voucher?.code).toBe(voucherCode);

    // The cart survives a failed payment — only the hold was released.
    const { body: cart } = await apiJson<{ items?: Array<{ origin: string; productId: string }> }>(
      request,
      'GET',
      '/account/cart',
      { token: accessToken, expectedStatus: 200 },
    );
    const kept = (cart.items ?? []).filter((item) => item.origin === 'user');
    expect(kept).toHaveLength(1);
    expect(kept[0]?.productId).toBe(variant.productId);

    // An intent that never failed cannot be released this way.
    const { body: fresh } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: accessToken,
        data: {
          addressId: address.id,
          courierCode: testCourierCode,
          express: false,
          paymentMethodId: card.id,
        },
        expectedStatus: 200,
      },
    );
    const freshIntentId = fresh.clientSecret!.split('_secret_')[0]!;
    const { body: notFailed } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/checkout/release-failed',
      { token: accessToken, data: { paymentIntentId: freshIntentId }, expectedStatus: 409 },
    );
    expect(notFailed.error?.code).toBe('payment_not_failed');
    await apiJson(request, 'POST', '/account/checkout/cancel', {
      token: accessToken,
      data: { paymentIntentId: freshIntentId },
      expectedStatus: 200,
    });
  });

  test('a guest decline: releases its reservation without any bearer token', async ({ request }) => {
    const env = loadTestEnv();
    const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
    if (!stripeSecretKey) throw new Error('The declined-payment API test requires STRIPE_SECRET_KEY.');
    const stripe = new Stripe(stripeSecretKey);
    const variant = await pickPurchasableVariant(request);

    const { body: intent } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/checkout/guest/create-intent',
      {
        data: {
          items: [
            {
              productId: variant.productId,
              shapeKey: variant.shapeKey,
              lengthKey: variant.lengthKey,
              size: variant.size,
              packKey: '',
              quantity: 1,
            },
          ],
          address: {
            recipientName: 'Ada Lovelace',
            line1: '10 rue de Test',
            postalCode: '75001',
            city: 'Paris',
            countryCode: 'FR',
            phone: '+33601020304',
          },
          courierCode: testCourierCode,
          express: false,
          email: uniqueEmail('guest-declined'),
          gdprConsent: { accepted: true },
          language: 'fr',
        },
        expectedStatus: 200,
      },
    );
    const paymentIntentId = intent.clientSecret!.split('_secret_')[0]!;

    const card = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_chargeDeclined' },
      billing_details: { name: 'Ada Lovelace' },
    });
    await expect(
      stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: card.id,
        return_url: `${env.frontBaseUrl}/cart`,
      }),
    ).rejects.toThrow();
    const declined = await stripe.paymentIntents.retrieve(paymentIntentId);
    expect(declined.status).toBe('requires_payment_method');
    expect(declined.last_payment_error).toBeTruthy();

    // Ownership here is knowledge of the intent id plus its guestEmail
    // metadata — there is no session to compare against.
    await apiJson(request, 'POST', '/checkout/guest/release-failed', {
      data: { paymentIntentId },
      expectedStatus: 200,
    });
    await apiJson(request, 'POST', '/checkout/guest/release-failed', {
      data: { paymentIntentId },
      expectedStatus: 200,
    });
  });
});
