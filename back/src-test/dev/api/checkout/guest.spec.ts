import Stripe from 'stripe';
import { test, expect } from 'patchright/test';
import { loadStripeSecretKey } from '../../../../scripts/envFile.js';
import {
  apiJson,
  apiJsonRetryRateLimit,
  createZeroingVoucher,
  enableAllShopPaymentMethods,
  pickPurchasableVariant,
  registerUser,
  testCourierCode,
  uniqueEmail,
  type PurchasableVariant,
} from '../../support/api.js';
import { loadTestEnv } from '../../support/env.js';
import { extractGuestManageToken, waitForMail } from '../../support/mail.js';

type GuestOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  placedAsGuest: boolean;
  integrityToken: string | null;
  paymentCaptureStatus: string;
  paymentMethod?: { type?: string };
  items: Array<{ productId: string | null; quantity: number; origin: 'user' | 'rule' }>;
};

const guestAddress = {
  recipientName: 'Ada Lovelace',
  line1: '10 rue de Test',
  postalCode: '75001',
  city: 'Paris',
  countryCode: 'FR',
  phone: '+33601020304',
};

function guestBody(
  variant: PurchasableVariant,
  email: string,
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
    email,
    gdprConsent: { accepted: true },
    language: 'fr',
    ...extra,
  };
}

test.describe('API guest checkout', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('guest');
  });

  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('a guest order: is confirmed without an account and refuses malformed input', async ({ request }) => {
    const variant = await pickPurchasableVariant(request);
    const email = uniqueEmail('guest');

    // Every required field is enforced server-side: no account means the
    // body is the only source of truth for who and where.
    for (const broken of [
      { items: [] },
      { address: { line1: '', postalCode: '', city: '', countryCode: '' } },
      { courierCode: '' },
      { email: '' },
      { gdprConsent: { accepted: false } },
      { voucherCode: 'x'.repeat(200) },
    ]) {
      const { body } = await apiJson<{ error?: { code?: string } }>(request, 'POST', '/checkout/guest/free', {
        data: { ...guestBody(variant, email), ...broken },
        expectedStatus: 400,
      });
      expect(body.error?.code).toBe('invalid_request');
    }

    // A product id that resolves to nothing real is rejected before pricing.
    await apiJson(request, 'POST', '/checkout/guest/free', {
      data: {
        ...guestBody(variant, email),
        items: [
          {
            productId: '00000000-0000-4000-8000-000000000000',
            shapeKey: variant.shapeKey,
            lengthKey: variant.lengthKey,
            size: variant.size,
            packKey: '',
            quantity: 1,
          },
        ],
      },
      expectedStatus: [400, 404],
    });

    // The read-only preview prices the ad-hoc cart the same way checkout will.
    const { body: preview } = await apiJson<{
      voucher?: { code?: string; description?: string } | null;
      subtotal?: number;
      shippingFee?: number;
      total?: number;
    }>(request, 'POST', '/checkout/guest/voucher/validate', {
      data: {
        items: guestBody(variant, email).items,
        address: guestAddress,
        courierCode: testCourierCode,
        express: false,
        code: voucherCode,
      },
      expectedStatus: 200,
    });
    expect(preview.voucher?.code).toBe(voucherCode);
    expect(preview.voucher?.description).toBeTruthy();
    expect(preview.subtotal).toBeGreaterThan(0);
    expect(preview.total).toBe(0);

    // Voucher failures collapse to one code so the endpoint cannot be used
    // to probe which codes exist.
    const { body: probed } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/checkout/guest/voucher/validate',
      {
        data: {
          items: guestBody(variant, email).items,
          address: guestAddress,
          courierCode: testCourierCode,
          express: false,
          code: 'NO-SUCH-VOUCHER',
        },
        expectedStatus: 400,
      },
    );
    expect(probed.error?.code).toBe('voucher_invalid');

    // Without the voucher the total is not zero, so the free route refuses
    // rather than handing out an unpaid order.
    const { body: notFree } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/checkout/guest/free',
      { data: guestBody(variant, email), expectedStatus: 409 },
    );
    expect(notFree.error?.code).toBe('payment_required');

    const sinceMs = Date.now() - 500;
    const { body: confirmed } = await apiJson<{ order?: GuestOrder }>(
      request,
      'POST',
      '/checkout/guest/free',
      { data: guestBody(variant, email, { voucherCode }), expectedStatus: 201 },
    );
    const order = confirmed.order!;
    expect(order.status).toBe('confirmed');
    expect(order.total).toBe(0);
    expect(order.placedAsGuest).toBe(true);
    expect(order.paymentCaptureStatus).toBe('not_required');
    expect(order.paymentMethod?.type).toBe('free');
    // The guest order carries the customer's line plus the cart rule's gift.
    expect(order.items.filter((item) => item.origin === 'user')).toHaveLength(1);
    expect(order.items.some((item) => item.origin === 'rule')).toBe(true);

    // The confirmation email is the guest's only handle on the order.
    const mail = await waitForMail({
      kind: 'user',
      toIncludes: email,
      subjectIncludes: 'Confirmation de votre commande',
      sinceMs,
      timeoutMs: 15_000,
    });
    const manageToken = extractGuestManageToken(mail);
    expect(manageToken).toBeTruthy();

    // Registering that same address independently never adopts the order.
    const registered = await registerUser(request, { email: uniqueEmail('guest-other') });
    const { body: notMine } = await apiJson<{ orders?: unknown[] }>(request, 'GET', '/account/guest-orders', {
      token: registered.accessToken,
      expectedStatus: 200,
    });
    expect(notMine.orders).toEqual([]);

    // The manage-order token creates the passwordless account and attaches
    // the order to it.
    const { status: manageStatus, body: managed } = await apiJsonRetryRateLimit<{
      created?: boolean;
      alreadyManaged?: boolean;
      accessToken?: string;
      user?: { email?: string; hasPassword?: boolean };
    }>(request, 'POST', '/auth/manage-guest-order', {
      data: { token: manageToken },
      expectedStatus: [200, 201],
    });
    expect(manageStatus).toBe(201);
    expect(managed.created).toBe(true);
    expect(managed.alreadyManaged).toBe(false);
    expect(managed.user?.email).toBe(email);
    expect(managed.user?.hasPassword).toBe(false);

    const { body: owned } = await apiJson<{ orders?: Array<{ id: string; placedAsGuest?: boolean }> }>(
      request,
      'GET',
      '/account/orders',
      { token: managed.accessToken, expectedStatus: 200 },
    );
    const attached = (owned.orders ?? []).find((entry) => entry.id === order.id);
    expect(attached).toBeTruthy();
    // The guest→account move is one-way, and the order keeps saying it was
    // placed as a guest.
    expect(attached?.placedAsGuest).toBe(true);

    // Now that it is owned, it is no longer offered as claimable.
    const { body: claimable } = await apiJson<{ orders?: unknown[] }>(
      request,
      'GET',
      '/account/guest-orders',
      { token: managed.accessToken, expectedStatus: 200 },
    );
    expect(claimable.orders).toEqual([]);
  });

  test('the integrity code: claims a leftover guest order and dismiss hides it', async ({ request }) => {
    const variant = await pickPurchasableVariant(request);
    const email = uniqueEmail('guest-claim');
    const { body: confirmed } = await apiJson<{ order?: GuestOrder }>(
      request,
      'POST',
      '/checkout/guest/free',
      { data: guestBody(variant, email, { voucherCode }), expectedStatus: 201 },
    );
    const order = confirmed.order!;
    expect(order.integrityToken).toBeTruthy();

    // An account created afterwards for the same address sees the order as
    // claimable, but only with its confirmation-email integrity code.
    const account = await registerUser(request, { email });
    const { body: claimable } = await apiJson<{
      orders?: Array<{ id: string; orderNumber: string; total: number; status: string }>;
    }>(request, 'GET', '/account/guest-orders', {
      token: account.accessToken,
      expectedStatus: 200,
    });
    const listed = (claimable.orders ?? []).find((entry) => entry.id === order.id);
    expect(listed).toBeTruthy();
    expect(listed?.orderNumber).toBe(order.orderNumber);
    // The claim list deliberately exposes no address or item detail.
    expect(Object.keys(listed!).sort()).toEqual(['id', 'orderNumber', 'status', 'total']);

    const { body: wrongCode } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      `/account/guest-orders/${order.id}/claim`,
      {
        token: account.accessToken,
        data: { integrityToken: 'ZZZZ-9999-ZZZZ-9999' },
        expectedStatus: 400,
      },
    );
    expect(wrongCode.error?.code).toBe('invalid_integrity_token');

    // Another account with a different address cannot claim it even with the
    // right code.
    const stranger = await registerUser(request);
    await apiJson(request, 'POST', `/account/guest-orders/${order.id}/claim`, {
      token: stranger.accessToken,
      data: { integrityToken: order.integrityToken },
      expectedStatus: 404,
    });

    await apiJson(request, 'POST', `/account/guest-orders/${order.id}/claim`, {
      token: account.accessToken,
      data: { integrityToken: order.integrityToken },
      expectedStatus: 200,
    });
    const { body: owned } = await apiJson<{ orders?: Array<{ id: string; placedAsGuest?: boolean }> }>(
      request,
      'GET',
      '/account/orders',
      { token: account.accessToken, expectedStatus: 200 },
    );
    expect((owned.orders ?? []).some((entry) => entry.id === order.id)).toBe(true);

    // A second guest order for the same address can be hidden instead.
    const { body: second } = await apiJson<{ order?: GuestOrder }>(request, 'POST', '/checkout/guest/free', {
      data: guestBody(variant, email, { voucherCode }),
      expectedStatus: 201,
    });
    await apiJson(request, 'POST', `/account/guest-orders/${second.order!.id}/dismiss`, {
      token: account.accessToken,
      expectedStatus: 200,
    });
    const { body: afterDismiss } = await apiJson<{ orders?: Array<{ id: string }> }>(
      request,
      'GET',
      '/account/guest-orders',
      { token: account.accessToken, expectedStatus: 200 },
    );
    expect((afterDismiss.orders ?? []).some((entry) => entry.id === second.order!.id)).toBe(false);
  });

  test('a paid guest checkout: reserves, cancels and finalizes through Stripe', async ({ request }) => {
    const env = loadTestEnv();
    const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
    if (!stripeSecretKey) throw new Error('The guest checkout API test requires STRIPE_SECRET_KEY.');
    const stripe = new Stripe(stripeSecretKey);
    const variant = await pickPurchasableVariant(request);
    const email = uniqueEmail('guest-paid');

    // A voucher that zeroes the total must not open a Stripe intent at all.
    const { body: free } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/checkout/guest/create-intent',
      { data: guestBody(variant, email, { voucherCode }), expectedStatus: 409 },
    );
    expect(free.error?.code).toBe('free_checkout_required');

    // An unsupported payment method is rejected before anything is reserved.
    await apiJson(request, 'POST', '/checkout/guest/create-intent', {
      data: guestBody(variant, email, { method: 'bitcoin' }),
      expectedStatus: 400,
    });

    const { body: abandoned } = await apiJson<{
      clientSecret?: string;
      reservationExpiresAt?: string;
      amount?: number;
      subtotal?: number;
      shippingFee?: number;
    }>(request, 'POST', '/checkout/guest/create-intent', {
      data: guestBody(variant, email),
      expectedStatus: 200,
    });
    expect(abandoned.amount).toBeGreaterThan(0);
    expect(abandoned.subtotal).toBeGreaterThan(0);
    expect(Date.parse(abandoned.reservationExpiresAt!)).toBeGreaterThan(Date.now());
    const abandonedIntentId = abandoned.clientSecret?.split('_secret_')[0];
    expect(abandonedIntentId).toMatch(/^pi_/);

    // Closing the payment modal releases the reservation.
    await apiJson(request, 'POST', '/checkout/guest/cancel', {
      data: { paymentIntentId: abandonedIntentId },
      expectedStatus: 200,
    });

    const { body: intent } = await apiJson<{ clientSecret?: string; amount?: number }>(
      request,
      'POST',
      '/checkout/guest/create-intent',
      { data: guestBody(variant, email), expectedStatus: 200 },
    );
    const paymentIntentId = intent.clientSecret!.split('_secret_')[0]!;

    // Only the finished payment creates the order, so finalizing an intent
    // nobody confirmed is refused.
    const { body: tooEarly } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/checkout/guest/finalize',
      { data: { paymentIntentId }, expectedStatus: 409 },
    );
    expect(tooEarly.error?.code).toBe('payment_not_completed');

    const card = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' },
      billing_details: { name: 'Ada Lovelace' },
    });
    const authorized = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: card.id,
      return_url: `${env.frontBaseUrl}/cart`,
    });
    expect(['requires_capture', 'succeeded']).toContain(authorized.status);

    const sinceMs = Date.now() - 500;
    const { body: finalized } = await apiJson<{ order?: GuestOrder }>(
      request,
      'POST',
      '/checkout/guest/finalize',
      { data: { paymentIntentId }, expectedStatus: 201 },
    );
    expect(finalized.order?.status).toBe('confirmed');
    expect(finalized.order?.placedAsGuest).toBe(true);
    expect(finalized.order?.paymentCaptureStatus).toBe('authorized');
    expect(finalized.order?.paymentMethod?.type).toBe('card');
    expect(finalized.order?.total).toBeGreaterThan(0);

    // Settling is idempotent: the webhook is the durable backstop for this
    // exact call, so a repeat must return the same order, never a second one.
    const { body: again } = await apiJson<{ order?: GuestOrder }>(
      request,
      'POST',
      '/checkout/guest/finalize',
      { data: { paymentIntentId }, expectedStatus: 201 },
    );
    expect(again.order?.id).toBe(finalized.order?.id);

    // An authorized payment can no longer be cancelled through the guest
    // route.
    const { body: tooLate } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/checkout/guest/cancel',
      { data: { paymentIntentId }, expectedStatus: 409 },
    );
    expect(tooLate.error?.code).toBe('payment_not_cancellable');

    // release-failed only accepts a genuinely declined intent.
    const { body: notFailed } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/checkout/guest/release-failed',
      { data: { paymentIntentId }, expectedStatus: 409 },
    );
    expect(notFailed.error?.code).toBe('payment_not_failed');

    for (const path of ['finalize', 'cancel', 'release-failed']) {
      await apiJson(request, 'POST', `/checkout/guest/${path}`, { data: {}, expectedStatus: 400 });
    }

    await waitForMail({
      kind: 'user',
      toIncludes: email,
      subjectIncludes: 'Confirmation de votre commande',
      sinceMs,
      timeoutMs: 15_000,
    });
  });

  test('manage-order link: a new account receives the remembered address and card', async ({ request }) => {
    const owned = await payGuestCardAndOpenManageLink(request, {
      rememberAddress: true,
      rememberCard: true,
    });
    expect(owned.addresses.some((address) => address.line1 === guestAddress.line1)).toBe(true);
    expect(owned.addresses.some((address) => address.label === 'Adresse guest mémorisée')).toBe(true);
    expect(owned.cards.some((card) => card.last4 === '4242')).toBe(true);
  });

  test('manage-order link: a remembered card is kept when the address was not', async ({ request }) => {
    const owned = await payGuestCardAndOpenManageLink(request, {
      rememberAddress: false,
      rememberCard: true,
    });
    expect(owned.addresses).toEqual([]);
    expect(owned.cards.some((card) => card.last4 === '4242')).toBe(true);
  });

  test('manage-order link: an unremembered card and address stay off the new account', async ({
    request,
  }) => {
    const owned = await payGuestCardAndOpenManageLink(request, {
      rememberAddress: false,
      rememberCard: false,
    });
    expect(owned.addresses).toEqual([]);
    expect(owned.cards).toEqual([]);
  });
});

/** Guest new-card pay, then the confirmation-email link that creates the account.
 * The card is forced to allow_redisplay limited so a pass cannot come from
 * Stripe echoing the pay-sheet checkbox. */
async function payGuestCardAndOpenManageLink(
  request: import('patchright/test').APIRequestContext,
  opts: { rememberAddress: boolean; rememberCard: boolean },
): Promise<{
  addresses: Array<{ line1?: string; label?: string | null }>;
  cards: Array<{ last4?: string }>;
}> {
  const env = loadTestEnv();
  const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
  if (!stripeSecretKey) throw new Error('The guest checkout API test requires STRIPE_SECRET_KEY.');
  const stripe = new Stripe(stripeSecretKey);
  const variant = await pickPurchasableVariant(request);
  const email = uniqueEmail('guest-remember');
  const sinceMs = Date.now() - 500;
  const { body: intent } = await apiJson<{ clientSecret?: string }>(
    request,
    'POST',
    '/checkout/guest/create-intent',
    {
      data: guestBody(variant, email, {
        method: 'new_card',
        address: {
          ...guestAddress,
          ...(opts.rememberAddress ? { savedForFuture: true, label: 'Adresse guest mémorisée' } : {}),
        },
      }),
      expectedStatus: 200,
    },
  );
  const paymentIntentId = intent.clientSecret!.split('_secret_')[0]!;
  await apiJson(request, 'POST', '/checkout/guest/remember-card', {
    data: { paymentIntentId, rememberCard: opts.rememberCard },
    expectedStatus: 200,
  });
  const card = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: { name: 'Ada Lovelace' },
    allow_redisplay: 'limited',
  });
  const authorized = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: card.id,
    return_url: `${env.frontBaseUrl}/cart`,
  });
  expect(['requires_capture', 'succeeded']).toContain(authorized.status);
  const confirmedMethod = await stripe.paymentMethods.retrieve(card.id);
  if (confirmedMethod.customer) {
    await stripe.paymentMethods.update(card.id, { allow_redisplay: 'limited' });
  }
  const stored = await stripe.paymentMethods.retrieve(card.id);
  expect(stored.allow_redisplay).toBe('limited');

  await apiJson(request, 'POST', '/checkout/guest/finalize', {
    data: { paymentIntentId },
    expectedStatus: 201,
  });
  const mail = await waitForMail({
    kind: 'user',
    toIncludes: email,
    subjectIncludes: 'Confirmation de votre commande',
    sinceMs,
    timeoutMs: 15_000,
  });
  const { body: managed } = await apiJsonRetryRateLimit<{ accessToken?: string; created?: boolean }>(
    request,
    'POST',
    '/auth/manage-guest-order',
    { data: { token: extractGuestManageToken(mail) }, expectedStatus: 201 },
  );
  expect(managed.created).toBe(true);
  const { body: addressBook } = await apiJson<{
    addresses?: Array<{ line1?: string; label?: string | null }>;
  }>(request, 'GET', '/account/addresses', { token: managed.accessToken, expectedStatus: 200 });
  const { body: methods } = await apiJson<{ paymentMethods?: Array<{ last4?: string }> }>(
    request,
    'GET',
    '/account/payment-methods',
    { token: managed.accessToken, expectedStatus: 200 },
  );
  return { addresses: addressBook.addresses ?? [], cards: methods.paymentMethods ?? [] };
}
