import Stripe from 'stripe';
import { test, expect } from 'patchright/test';
import { loadStripeSecretKey } from '../../../../scripts/envFile.js';
import {
  apiJson,
  createAddress,
  pickPurchasableVariant,
  registerUser,
  testCourierCode,
  uniqueEmail,
  type PurchasableVariant,
} from '../../support/api.js';
import { loadTestEnv } from '../../support/env.js';
import { initVoucher } from '../../support/ops.js';

function testStripe() {
  const env = loadTestEnv();
  return new Stripe(loadStripeSecretKey(env.root, env.mode));
}

async function checkoutWithVoucher(
  request: Parameters<typeof apiJson>[0],
  accessToken: string,
  addressId: string,
  paymentMethodId: string,
  voucherCode: string,
) {
  const { body: intentBody } = await apiJson<{ clientSecret?: string }>(
    request,
    'POST',
    '/account/checkout/create-intent',
    {
      token: accessToken,
      data: {
        addressId,
        courierCode: testCourierCode,
        express: false,
        paymentMethodId,
        voucherCode,
      },
      expectedStatus: 200,
    },
  );
  const paymentIntentId = intentBody.clientSecret?.split('_secret_')[0];
  expect(paymentIntentId).toMatch(/^pi_/);
  const stripe = testStripe();
  const authorized = await stripe.paymentIntents.confirm(paymentIntentId!, {
    payment_method: paymentMethodId,
    return_url: 'http://localhost:5173/cart',
  });
  expect(authorized.status).toBe('requires_capture');
  await apiJson(request, 'POST', '/account/checkout/finalize', {
    token: accessToken,
    data: { paymentIntentId },
    expectedStatus: 201,
  });
}

async function attachOneTimeCard(
  request: Parameters<typeof apiJson>[0],
  accessToken: string,
  stripe: Stripe,
): Promise<string> {
  const { body: setupBody } = await apiJson<{ clientSecret?: string }>(
    request,
    'POST',
    '/account/payment-methods/setup-intent',
    { token: accessToken, expectedStatus: 200 },
  );
  const setupIntentId = setupBody.clientSecret?.split('_secret_')[0];
  expect(setupIntentId).toMatch(/^seti_/);
  const createdMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: { name: 'Ada Lovelace' },
  });
  const confirmedSetup = await stripe.setupIntents.confirm(setupIntentId!, {
    payment_method: createdMethod.id,
  });
  expect(confirmedSetup.status).toBe('succeeded');
  await apiJson(request, 'POST', '/account/payment-methods/register', {
    token: accessToken,
    data: { paymentMethodId: createdMethod.id, savedForFuture: false },
    expectedStatus: 200,
  });
  return createdMethod.id;
}

const guestAddress = {
  recipientName: 'Ada Lovelace',
  line1: '10 rue de Test',
  postalCode: '75001',
  city: 'Paris',
  countryCode: 'FR',
  phone: '+33601020304',
};

function guestValidateBody(
  variant: PurchasableVariant,
  code: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
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
    address: guestAddress,
    courierCode: testCourierCode,
    express: false,
    code,
    ...extra,
  };
}

function guestFreeBody(
  variant: PurchasableVariant,
  email: string,
  voucherCode: string,
): Record<string, unknown> {
  return {
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
    address: guestAddress,
    courierCode: testCourierCode,
    express: false,
    email,
    gdprConsent: { accepted: true },
    language: 'fr',
    voucherCode,
  };
}

test.describe('API vouchers', () => {
  test('offer types: each is validated on a real cart and the applied discount is returned', async ({ request }) => {
    const stamp = Date.now();
    const { accessToken } = await registerUser(request);
    const addressId = (await createAddress(request, accessToken)).id;
    const variant = await pickPurchasableVariant(request, { token: accessToken });
    await apiJson(request, 'POST', '/account/cart', {
      token: accessToken,
      data: {
        productId: variant.productId,
        shapeKey: variant.shapeKey,
        lengthKey: variant.lengthKey,
        size: variant.size,
        quantity: 2,
      },
      expectedStatus: 200,
    });

    const specs = [
      { name: `e2e-pct-${stamp}`, offer: { kind: 'percent' as const, percent: 10 } },
      { name: `e2e-amt-${stamp}`, offer: { kind: 'amount' as const, amount: 5 } },
      { name: `e2e-ship-${stamp}`, offer: { kind: 'free-shipping' as const } },
      { name: `e2e-item-${stamp}`, offer: { kind: 'free-item' as const, maxItemPrice: 15 } },
      { name: `e2e-nth-${stamp}`, offer: { kind: 'free-item-nth' as const, requiredItemQuantity: 1 } },
    ];

    for (const spec of specs) {
      const created = await initVoucher(spec.name, spec.offer, { maxPerUser: 0 });
      const code =
        (created as { voucher?: { code?: string }; code?: string; name?: string }).voucher?.code ??
        (created as { code?: string }).code ??
        (created as { name?: string }).name ??
        spec.name;

      const { body } = await apiJson<{
        success: boolean;
        voucher?: {
          code?: string;
          discount?: number;
          itemDiscount?: number;
          shippingDiscount?: number;
          offer?: { type?: string };
        };
        subtotal?: number;
        shippingFee?: number;
        total?: number;
      }>(request, 'POST', '/account/checkout/voucher/validate', {
        token: accessToken,
        data: { addressId, code, courierCode: testCourierCode, express: false },
        expectedStatus: 200,
      });
      expect(body.success).toBe(true);
      expect(body.voucher?.code).toBe(code);
      expect(body.voucher?.offer?.type).toBe(spec.offer.kind.replaceAll('-', '_'));
      expect(body.voucher?.discount).toBeGreaterThan(0);
      expect(body.subtotal).toBeGreaterThan(0);
      expect(body.shippingFee).toBeGreaterThanOrEqual(0);
      expect(body.total).toBeGreaterThanOrEqual(0);
      expect(body.total).toBeLessThanOrEqual((body.subtotal ?? 0) + (body.shippingFee ?? 0));
    }
  });

  test('default per-user cap: blocks a second paid checkout for the same account', async ({ request }) => {
    const stamp = Date.now();
    const stripe = testStripe();
    const { accessToken } = await registerUser(request);
    const addressId = (await createAddress(request, accessToken)).id;
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

    const created = await initVoucher(`e2e-cap1-${stamp}`, { kind: 'amount', amount: 2 });
    const code =
      (created as { code?: string }).code ??
      (created as { name?: string }).name ??
      `e2e-cap1-${stamp}`;

    const paymentMethodId = await attachOneTimeCard(request, accessToken, stripe);
    await checkoutWithVoucher(request, accessToken, addressId, paymentMethodId, code);

    await apiJson(request, 'POST', '/account/checkout/voucher/validate', {
      token: accessToken,
      data: { addressId, code, courierCode: testCourierCode, express: false },
      expectedStatus: 400,
    });

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

    const paymentMethodId2 = await attachOneTimeCard(request, accessToken, stripe);
    const { body: blockedIntent } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: accessToken,
        data: {
          addressId,
          courierCode: testCourierCode,
          express: false,
          paymentMethodId: paymentMethodId2,
          voucherCode: code,
        },
        expectedStatus: 409,
      },
    );
    expect(blockedIntent.error?.code).toBe('voucher_user_limit_reached');
  });

  test('max-per-user 0: allows the same account to reuse a voucher', async ({ request }) => {
    const stamp = Date.now();
    const stripe = testStripe();
    const { accessToken } = await registerUser(request);
    const addressId = (await createAddress(request, accessToken)).id;
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

    const created = await initVoucher(`e2e-cap0-${stamp}`, { kind: 'amount', amount: 2 }, { maxPerUser: 0 });
    const code =
      (created as { code?: string }).code ??
      (created as { name?: string }).name ??
      `e2e-cap0-${stamp}`;

    const paymentMethodId = await attachOneTimeCard(request, accessToken, stripe);
    await checkoutWithVoucher(request, accessToken, addressId, paymentMethodId, code);
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
    const paymentMethodId2 = await attachOneTimeCard(request, accessToken, stripe);
    await checkoutWithVoucher(request, accessToken, addressId, paymentMethodId2, code);
  });

  test('min-buy: rejects amount and free-shipping vouchers below merchandise subtotal', async ({ request }) => {
    const stamp = Date.now();
    const { accessToken } = await registerUser(request);
    const addressId = (await createAddress(request, accessToken)).id;
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

    const highFloor = 99_999;
    const lowFloor = 1;

    const amountCreated = await initVoucher(
      `e2e-min-amt-${stamp}`,
      { kind: 'amount', amount: 5 },
      { maxPerUser: 0, minBuy: highFloor },
    );
    const amountCode =
      (amountCreated as { code?: string }).code ??
      (amountCreated as { name?: string }).name ??
      `e2e-min-amt-${stamp}`;

    await apiJson(request, 'POST', '/account/checkout/voucher/validate', {
      token: accessToken,
      data: { addressId, code: amountCode, courierCode: testCourierCode, express: false },
      expectedStatus: 400,
    });

    const amountOk = await initVoucher(
      `e2e-min-amt-ok-${stamp}`,
      { kind: 'amount', amount: 5 },
      { maxPerUser: 0, minBuy: lowFloor },
    );
    const amountOkCode =
      (amountOk as { code?: string }).code ??
      (amountOk as { name?: string }).name ??
      `e2e-min-amt-ok-${stamp}`;

    const { body: amountBody } = await apiJson<{ success?: boolean; voucher?: { code?: string } }>(
      request,
      'POST',
      '/account/checkout/voucher/validate',
      {
        token: accessToken,
        data: { addressId, code: amountOkCode, courierCode: testCourierCode, express: false },
        expectedStatus: 200,
      },
    );
    expect(amountBody.success).toBe(true);
    expect(amountBody.voucher?.code).toBe(amountOkCode);

    const shipCreated = await initVoucher(
      `e2e-min-ship-${stamp}`,
      { kind: 'free-shipping' },
      { maxPerUser: 0, minBuy: highFloor },
    );
    const shipCode =
      (shipCreated as { code?: string }).code ??
      (shipCreated as { name?: string }).name ??
      `e2e-min-ship-${stamp}`;

    await apiJson(request, 'POST', '/account/checkout/voucher/validate', {
      token: accessToken,
      data: { addressId, code: shipCode, courierCode: testCourierCode, express: false },
      expectedStatus: 400,
    });

    const shipOk = await initVoucher(
      `e2e-min-ship-ok-${stamp}`,
      { kind: 'free-shipping' },
      { maxPerUser: 0, minBuy: lowFloor },
    );
    const shipOkCode =
      (shipOk as { code?: string }).code ??
      (shipOk as { name?: string }).name ??
      `e2e-min-ship-ok-${stamp}`;

    const { body: shipBody } = await apiJson<{ success?: boolean; voucher?: { code?: string } }>(
      request,
      'POST',
      '/account/checkout/voucher/validate',
      {
        token: accessToken,
        data: { addressId, code: shipOkCode, courierCode: testCourierCode, express: false },
        expectedStatus: 200,
      },
    );
    expect(shipBody.success).toBe(true);
    expect(shipBody.voucher?.code).toBe(shipOkCode);
  });

  test('guest per-user cap: blocks a second order for the same email', async ({ request }) => {
    const stamp = Date.now();
    const email = uniqueEmail('guest-voucher-cap');
    const variant = await pickPurchasableVariant(request);
    const created = await initVoucher(`e2e-guest-cap-${stamp}`, { kind: 'amount', amount: 99_999 });
    const code =
      (created as { code?: string }).code ??
      (created as { name?: string }).name ??
      `e2e-guest-cap-${stamp}`;

    await apiJson(request, 'POST', '/checkout/guest/free', {
      data: guestFreeBody(variant, email, code),
      expectedStatus: 201,
    });

    await apiJson(request, 'POST', '/checkout/guest/voucher/validate', {
      data: guestValidateBody(variant, code, { email }),
      expectedStatus: 400,
    });

    const { body: blocked } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/checkout/guest/free',
      { data: guestFreeBody(variant, email, code), expectedStatus: 409 },
    );
    expect(blocked.error?.code).toBe('voucher_user_limit_reached');
  });

  test('guest validate with email: enforces min-buy before checkout', async ({ request }) => {
    const stamp = Date.now();
    const email = uniqueEmail('guest-voucher-min');
    const variant = await pickPurchasableVariant(request);
    const created = await initVoucher(
      `e2e-guest-min-${stamp}`,
      { kind: 'amount', amount: 5 },
      { maxPerUser: 0, minBuy: 99_999 },
    );
    const code =
      (created as { code?: string }).code ??
      (created as { name?: string }).name ??
      `e2e-guest-min-${stamp}`;

    await apiJson(request, 'POST', '/checkout/guest/voucher/validate', {
      data: guestValidateBody(variant, code, { email }),
      expectedStatus: 400,
    });
  });
});
