import Stripe from 'stripe';
import { test, expect } from 'patchright/test';
import { loadStripeSecretKey } from '../../../../scripts/envFile.js';
import {
  apiJson,
  createAddress,
  createBeHomeAddress,
  enableAllShopPaymentMethods,
  pickPurchasableVariant,
  registerAdmin,
  registerUser,
  setShopPaymentMethods,
  testCourierCode,
} from '../../support/api.js';
import { loadTestEnv } from '../../support/env.js';

type AddressResponse = { address?: { id?: string; savedForFuture?: boolean } };

test.describe('API checkout finalization', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('one-time address and card: are consumed only after the authorized order is finalized', async ({ request }) => {
    const env = loadTestEnv();
    const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
    if (!stripeSecretKey) throw new Error('The local checkout API test requires STRIPE_SECRET_KEY.');
    const stripe = new Stripe(stripeSecretKey);
    const { accessToken } = await registerUser(request);

    // A remembered address remains in the account after a separate one-time
    // checkout is finalized. This makes the saved/one-time lifecycle
    // distinction explicit rather than merely testing the one-time branch.
    const { body: savedAddressBody } = await apiJson<AddressResponse>(request, 'POST', '/account/addresses', {
      token: accessToken,
      data: {
        kind: 'livraison',
        label: 'À conserver E2E',
        recipientName: 'Ada Lovelace',
        line1: '11 rue de Test',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        phone: '+33601020304',
        networkCodes: ['home'],
        savedForFuture: true,
      },
      expectedStatus: 201,
    });
    const savedAddressId = savedAddressBody.address?.id;
    expect(savedAddressId).toBeTruthy();
    expect(savedAddressBody.address?.savedForFuture).toBe(true);

    const { body: addressBody } = await apiJson<AddressResponse>(request, 'POST', '/account/addresses', {
      token: accessToken,
      data: {
        kind: 'livraison',
        label: 'Usage unique E2E',
        recipientName: 'Ada Lovelace',
        line1: '10 rue de Test',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        phone: '+33601020304',
        networkCodes: ['home'],
        savedForFuture: false,
      },
      expectedStatus: 201,
    });
    const addressId = addressBody.address?.id;
    expect(addressId).toBeTruthy();
    expect(addressBody.address?.savedForFuture).toBe(false);
    // A one-time address is deliberately absent from the saved address book,
    // but remains server-side usable until a checkout is actually confirmed.
    await apiJson(request, 'GET', `/account/addresses/${addressId}`, {
      token: accessToken,
      expectedStatus: 200,
    });

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

    // Use the same SetupIntent → register sequence as the front. Stripe's
    // test token only creates a tokenized PaymentMethod; it never enters the
    // application as raw card data.
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

    const { body: savedSetupBody } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/payment-methods/setup-intent',
      { token: accessToken, expectedStatus: 200 },
    );
    const savedSetupIntentId = savedSetupBody.clientSecret?.split('_secret_')[0];
    expect(savedSetupIntentId).toMatch(/^seti_/);
    const savedMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_mastercard' },
      billing_details: { name: 'Ada Lovelace' },
    });
    const confirmedSavedSetup = await stripe.setupIntents.confirm(savedSetupIntentId!, {
      payment_method: savedMethod.id,
    });
    expect(confirmedSavedSetup.status).toBe('succeeded');
    await apiJson(request, 'POST', '/account/payment-methods/register', {
      token: accessToken,
      data: { paymentMethodId: savedMethod.id, savedForFuture: true },
      expectedStatus: 200,
    });
    await apiJson(request, 'GET', `/account/payment-methods/${createdMethod.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });

    // Persist the exact selection first: successful confirmation must clear
    // it, rather than leave a one-time id to reappear in the next checkout.
    await apiJson(request, 'PUT', '/account/checkout/selection', {
      token: accessToken,
      data: {
        addressId,
        courierCode: 'mondial-relay-home',
        express: false,
        billingAddressId: null,
        sameAsBilling: true,
        paymentMethodId: createdMethod.id,
        voucherCode: null,
      },
      expectedStatus: 200,
    });

    // Closing an unconfirmed payment dialog releases stock but deliberately
    // leaves one-time customer data available in this unfinished checkout.
    const { body: abandonedIntentBody } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: accessToken,
        data: {
          addressId,
          courierCode: 'mondial-relay-home',
          express: false,
          paymentMethodId: createdMethod.id,
        },
        expectedStatus: 200,
      },
    );
    const abandonedPaymentIntentId = abandonedIntentBody.clientSecret?.split('_secret_')[0];
    expect(abandonedPaymentIntentId).toMatch(/^pi_/);
    await apiJson(request, 'POST', '/account/checkout/cancel', {
      token: accessToken,
      data: { paymentIntentId: abandonedPaymentIntentId },
      expectedStatus: 200,
    });
    await apiJson(request, 'GET', `/account/addresses/${addressId}`, {
      token: accessToken,
      expectedStatus: 200,
    });
    await apiJson(request, 'GET', `/account/payment-methods/${createdMethod.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });

    const { body: intentBody } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: accessToken,
        data: {
          addressId,
          courierCode: 'mondial-relay-home',
          express: false,
          paymentMethodId: createdMethod.id,
        },
        expectedStatus: 200,
      },
    );
    const paymentIntentId = intentBody.clientSecret?.split('_secret_')[0];
    expect(paymentIntentId).toMatch(/^pi_/);
    // Reserving stock and opening Stripe must not consume one-time customer
    // data. Closing this payment UI or a declined payment may release the
    // reservation, but it must not make the chosen address/card disappear.
    await apiJson(request, 'GET', `/account/addresses/${addressId}`, {
      token: accessToken,
      expectedStatus: 200,
    });
    await apiJson(request, 'GET', `/account/payment-methods/${createdMethod.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });
    const authorized = await stripe.paymentIntents.confirm(paymentIntentId!, {
      payment_method: createdMethod.id,
      return_url: `${env.frontBaseUrl}/cart`,
    });
    expect(authorized.status).toBe('requires_capture');

    const { body: finalized } = await apiJson<{
      order?: { id?: string; status?: string; paymentCaptureStatus?: string; paymentMethod?: { type?: string } };
    }>(request, 'POST', '/account/checkout/finalize', {
      token: accessToken,
      data: { paymentIntentId },
      expectedStatus: 201,
    });
    expect(finalized.order?.id).toBeTruthy();
    expect(finalized.order?.status).toBe('confirmed');
    expect(finalized.order?.paymentCaptureStatus).toBe('authorized');
    expect(finalized.order?.paymentMethod?.type).toBe('card');

    // The modal filtering is only convenience. These crafted requests prove
    // the back end prevents a confirmed home-delivery order from changing to
    // either another country or a Mondial Relay pickup address.
    const orderId = finalized.order?.id;
    expect(orderId).toBeTruthy();
    const { body: foreignHomeBody } = await apiJson<AddressResponse>(request, 'POST', '/account/addresses', {
      token: accessToken,
      data: {
        kind: 'livraison',
        label: 'Maison étrangère E2E',
        recipientName: 'Ada Lovelace',
        line1: '1 rue de Bruxelles',
        postalCode: '1000',
        city: 'Bruxelles',
        countryCode: 'BE',
        phone: '+33601020304',
        networkCodes: ['home'],
        savedForFuture: true,
      },
      expectedStatus: 201,
    });
    const { body: relayPointBody } = await apiJson<AddressResponse>(request, 'POST', '/account/addresses', {
      token: accessToken,
      data: {
        kind: 'livraison',
        label: 'Point relais E2E',
        recipientName: 'Ada Lovelace',
        line1: '12 rue de la Poste',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        networkCodes: ['mondial-relay-point'],
        pickupPoints: { 'mondial-relay-point': { id: 'FR-75001-LOCK' } },
        savedForFuture: true,
      },
      expectedStatus: 201,
    });
    const { body: lockBody } = await apiJson<{ lock?: { lockToken?: string } }>(
      request,
      'POST',
      `/account/orders/${orderId}/revisions/lock`,
      { token: accessToken, expectedStatus: 200 },
    );
    const lockToken = lockBody.lock?.lockToken;
    expect(lockToken).toBeTruthy();
    const { body: foreignAttempt } = await apiJson<{ error?: { code?: string } }>(request, 'PATCH', `/account/orders/${orderId}/shipping`, {
      token: accessToken,
      data: { lockToken, addressId: foreignHomeBody.address?.id },
      expectedStatus: 409,
    });
    expect(foreignAttempt.error?.code).toBe('shipping_country_mismatch');
    const { body: relayAttempt } = await apiJson<{ error?: { code?: string } }>(request, 'PATCH', `/account/orders/${orderId}/shipping`, {
      token: accessToken,
      data: { lockToken, addressId: relayPointBody.address?.id },
      expectedStatus: 409,
    });
    expect(relayAttempt.error?.code).toBe('courier_network_unavailable');

    const { body: selection } = await apiJson<{
      addressId?: string | null;
      billingAddressId?: string | null;
      paymentMethodId?: string | null;
    }>(request, 'GET', '/account/checkout/selection', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(selection.addressId).toBeNull();
    expect(selection.billingAddressId).toBeNull();
    expect(selection.paymentMethodId).toBeNull();

    await apiJson(request, 'GET', `/account/payment-methods/${createdMethod.id}`, {
      token: accessToken,
      expectedStatus: 404,
    });
    const { body: savedAddresses } = await apiJson<{ addresses?: Array<{ id: string }> }>(
      request,
      'GET',
      '/account/addresses',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(savedAddresses.addresses?.some((address) => address.id === addressId)).toBe(false);
    expect(savedAddresses.addresses?.some((address) => address.id === savedAddressId)).toBe(true);
    await apiJson(request, 'GET', `/account/addresses/${savedAddressId}`, {
      token: accessToken,
      expectedStatus: 200,
    });
    const { body: savedMethods } = await apiJson<{ paymentMethods?: Array<{ id: string }> }>(
      request,
      'GET',
      '/account/payment-methods',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(savedMethods.paymentMethods?.some((method) => method.id === createdMethod.id)).toBe(false);
    expect(savedMethods.paymentMethods?.some((method) => method.id === savedMethod.id)).toBe(true);
    await apiJson(request, 'GET', `/account/payment-methods/${savedMethod.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });

    // Server-side eligibility is the final guard: a crafted second checkout
    // cannot reuse an address/card that the browser happened to remember.
    const { body: retry } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: accessToken,
        data: {
          addressId,
          courierCode: 'mondial-relay-home',
          express: false,
          paymentMethodId: createdMethod.id,
        },
        expectedStatus: 409,
      },
    );
    expect(retry.error?.code).toBe('payment_method_not_available');
  });

  test('need_review order: it is kept and refunded only after an explicit admin decision', async ({ request }) => {
    const env = loadTestEnv();
    const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
    if (!stripeSecretKey) throw new Error('The local checkout API test requires STRIPE_SECRET_KEY.');
    const stripe = new Stripe(stripeSecretKey);
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);
    const { body: credited } = await apiJson<{ wallet?: { available?: number } }>(
      request,
      'POST',
      '/admin/loyalty/credit',
      {
        token: admin.accessToken,
        data: { email: customer.email, amount: 5, reason: 'need_review refund E2E' },
        expectedStatus: 200,
      },
    );
    expect(credited.wallet?.available).toBe(5);
    const address = await createAddress(request, customer.accessToken);
    const variant = await pickPurchasableVariant(request, { token: customer.accessToken });

    await apiJson(request, 'POST', '/account/cart', {
      token: customer.accessToken,
      data: {
        productId: variant.productId,
        shapeKey: variant.shapeKey,
        lengthKey: variant.lengthKey,
        size: variant.size,
        quantity: 1,
      },
      expectedStatus: 200,
    });
    const { body: setup } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/payment-methods/setup-intent',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    const setupIntentId = setup.clientSecret?.split('_secret_')[0];
    expect(setupIntentId).toMatch(/^seti_/);
    const card = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' },
      billing_details: { name: 'Review Flow E2E' },
    });
    expect((await stripe.setupIntents.confirm(setupIntentId!, { payment_method: card.id })).status).toBe(
      'succeeded',
    );
    await apiJson(request, 'POST', '/account/payment-methods/register', {
      token: customer.accessToken,
      data: { paymentMethodId: card.id, savedForFuture: true },
      expectedStatus: 200,
    });

    const { body: intent } = await apiJson<{ clientSecret?: string; loyaltyCredit?: number }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: customer.accessToken,
        data: {
          addressId: address.id,
          courierCode: testCourierCode,
          express: false,
          paymentMethodId: card.id,
          // Wallet spend is opt-in; without this the PI amount ignores credit
          // and the need_review refund path never exercises loyalty restore.
          applyLoyalty: true,
        },
        expectedStatus: 200,
      },
    );
    const paymentIntentId = intent.clientSecret?.split('_secret_')[0];
    expect(paymentIntentId).toMatch(/^pi_/);
    expect(intent.loyaltyCredit).toBeGreaterThan(0);
    expect(
      (
        await stripe.paymentIntents.confirm(paymentIntentId!, {
          payment_method: card.id,
          return_url: `${env.frontBaseUrl}/cart`,
        })
      ).status,
    ).toBe('requires_capture');

    // Make the mutable normal path fail after Stripe authorization. The
    // encrypted reservation snapshot must still produce a durable order.
    await apiJson(request, 'DELETE', `/account/addresses/${address.id}`, {
      token: customer.accessToken,
      expectedStatus: 200,
    });
    const { body: finalized } = await apiJson<{
      order?: Record<string, unknown> & { id?: string; status?: string };
    }>(request, 'POST', '/account/checkout/finalize', {
      token: customer.accessToken,
      data: { paymentIntentId },
      expectedStatus: 201,
    });
    const orderId = finalized.order?.id;
    expect(orderId).toBeTruthy();
    expect(finalized.order?.status).toBe('need_review');
    expect(finalized.order && 'statusReason' in finalized.order).toBe(false);

    const { body: active } = await apiJson<{ orders?: Array<Record<string, unknown> & { id?: string; status?: string }> }>(
      request,
      'GET',
      '/account/orders?scope=active',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    const customerOrder = active.orders?.find((order) => order.id === orderId);
    expect(customerOrder?.status).toBe('need_review');
    expect(customerOrder && 'statusReason' in customerOrder).toBe(false);
    await apiJson(request, 'GET', `/account/orders/${orderId}/invoice`, {
      token: customer.accessToken,
      expectedStatus: 409,
    });

    const { body: adminDetail } = await apiJson<{
      order?: { status?: string; statusReason?: string; needReviewBlocked?: boolean; stripePaymentIntentId?: string };
    }>(request, 'GET', `/admin/orders/${orderId}`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(adminDetail.order?.status).toBe('need_review');
    expect(adminDetail.order?.statusReason).toContain('address_not_found');
    expect(adminDetail.order?.needReviewBlocked).toBe(false);
    expect(adminDetail.order?.stripePaymentIntentId).toBe(paymentIntentId);

    const { body: spentWallet } = await apiJson<{ wallet?: { available?: number } }>(
      request,
      'GET',
      '/account/loyalty/wallet',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(spentWallet.wallet?.available).toBeCloseTo(5 - intent.loyaltyCredit!, 2);

    const captured = await stripe.paymentIntents.capture(paymentIntentId!);
    expect(captured.status).toBe('succeeded');
    const { body: resolved } = await apiJson<{
      changed?: boolean;
      stripeResolution?: { action?: string; refundId?: string };
      order?: { status?: string; paymentCaptureStatus?: string };
    }>(request, 'POST', `/admin/orders/${orderId}/need-review-resolution`, {
      token: admin.accessToken,
      data: { decision: 'cancel', confirmed: true },
      expectedStatus: 200,
    });
    expect(resolved.changed).toBe(true);
    expect(resolved.stripeResolution?.action).toBe('refunded');
    expect(resolved.stripeResolution?.refundId).toMatch(/^re_/);
    expect(resolved.order?.status).toBe('cancelled');
    expect(resolved.order?.paymentCaptureStatus).toBe('captured');

    const { body: restoredWallet } = await apiJson<{ wallet?: { available?: number } }>(
      request,
      'GET',
      '/account/loyalty/wallet',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(restoredWallet.wallet?.available).toBe(5);
    const { body: loyaltyLedger } = await apiJson<{ entries?: Array<{ kind?: string }> }>(
      request,
      'GET',
      '/account/loyalty/ledger',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(loyaltyLedger.entries?.some((entry) => entry.kind === 'spend_refund')).toBe(true);

    const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId!, limit: 100 });
    expect(refunds.data.filter((refund) => refund.status === 'succeeded')).toHaveLength(1);
    expect(refunds.data[0]?.amount).toBe(captured.amount_received);

    // A lost admin response is safe to replay: no second refund is created.
    const { body: replay } = await apiJson<{ changed?: boolean }>(
      request,
      'POST',
      `/admin/orders/${orderId}/need-review-resolution`,
      {
        token: admin.accessToken,
        data: { decision: 'cancel', confirmed: true },
        expectedStatus: 200,
      },
    );
    expect(replay.changed).toBe(false);
    const refundsAfterReplay = await stripe.refunds.list({ payment_intent: paymentIntentId!, limit: 100 });
    expect(refundsAfterReplay.data.filter((refund) => refund.status === 'succeeded')).toHaveLength(1);

    const { body: history } = await apiJson<{ orders?: Array<{ id?: string; status?: string }> }>(
      request,
      'GET',
      '/account/orders?scope=history',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(history.orders?.find((order) => order.id === orderId)?.status).toBe('cancelled');
  });

  test('Bancontact: opens an automatically captured intent and honors opt-out', async ({ request }) => {
    const env = loadTestEnv();
    const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
    if (!stripeSecretKey) throw new Error('The local checkout API test requires STRIPE_SECRET_KEY.');
    const stripe = new Stripe(stripeSecretKey);
    const { accessToken } = await registerUser(request);
    const address = await createBeHomeAddress(request, accessToken);
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

    const intentBody = {
      addressId: address.id,
      courierCode: 'colissimo-home',
      express: false,
      method: 'bancontact',
    };

    const { body: opened } = await apiJson<{ clientSecret?: string }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      { token: accessToken, data: intentBody, expectedStatus: 200 },
    );
    const paymentIntentId = opened.clientSecret?.split('_secret_')[0];
    expect(paymentIntentId).toMatch(/^pi_/);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId!);
    expect(intent.capture_method).toBe('automatic');
    expect(intent.payment_method_types).toEqual(['bancontact']);
    await apiJson(request, 'POST', '/account/checkout/cancel', {
      token: accessToken,
      data: { paymentIntentId },
      expectedStatus: 200,
    });

    await apiJson(request, 'PUT', '/account/payment-methods/bancontact-enabled', {
      token: accessToken,
      data: { enabled: false },
      expectedStatus: 200,
    });
    const { body: methodsAfterOptOut } = await apiJson<{ bancontactEnabled?: boolean }>(
      request,
      'GET',
      '/account/payment-methods',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(methodsAfterOptOut.bancontactEnabled).toBe(false);
    await apiJson(request, 'PUT', '/account/payment-methods/bancontact-enabled', {
      token: accessToken,
      data: { enabled: true },
      expectedStatus: 200,
    });

    await setShopPaymentMethods(request, { paymentBancontactEnabled: false });
    const { body: shopOff } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      { token: accessToken, data: intentBody, expectedStatus: 403 },
    );
    expect(shopOff.error?.code).toBe('payment_method_forbidden');
    await setShopPaymentMethods(request, { paymentBancontactEnabled: true });
  });

  test('new_card: authorizes the order amount without a prior SetupIntent', async ({ request }) => {
    const env = loadTestEnv();
    const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
    if (!stripeSecretKey) throw new Error('The local checkout API test requires STRIPE_SECRET_KEY.');
    const stripe = new Stripe(stripeSecretKey);
    const { accessToken } = await registerUser(request);

    const { body: addressBody } = await apiJson<AddressResponse>(request, 'POST', '/account/addresses', {
      token: accessToken,
      data: {
        kind: 'livraison',
        label: 'New card E2E',
        recipientName: 'Ada Lovelace',
        line1: '12 rue de Test',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        phone: '+33601020304',
        networkCodes: ['home'],
        savedForFuture: true,
      },
      expectedStatus: 201,
    });
    const addressId = addressBody.address?.id;
    expect(addressId).toBeTruthy();

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

    await apiJson(request, 'PUT', '/account/checkout/selection', {
      token: accessToken,
      data: {
        addressId,
        courierCode: 'mondial-relay-home',
        express: false,
        billingAddressId: null,
        sameAsBilling: true,
        paymentMethodId: 'new_card',
        voucherCode: null,
      },
      expectedStatus: 200,
    });

    const { body: intentBody } = await apiJson<{ clientSecret?: string; amount?: number }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: accessToken,
        data: {
          addressId,
          courierCode: 'mondial-relay-home',
          express: false,
          method: 'new_card',
        },
        expectedStatus: 200,
      },
    );
    expect(intentBody.amount).toBeGreaterThan(0);
    const paymentIntentId = intentBody.clientSecret?.split('_secret_')[0];
    expect(paymentIntentId).toMatch(/^pi_/);

    const piBefore = await stripe.paymentIntents.retrieve(paymentIntentId!);
    expect(piBefore.setup_future_usage).toBe('on_session');
    expect(piBefore.metadata.paymentMethodId).toBeFalsy();
    expect(piBefore.payment_method_types).toEqual(['card']);

    const createdMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' },
      billing_details: { name: 'Ada Lovelace' },
    });
    const authorized = await stripe.paymentIntents.confirm(paymentIntentId!, {
      payment_method: createdMethod.id,
    });
    expect(['requires_capture', 'succeeded']).toContain(authorized.status);

    await apiJson(request, 'POST', '/account/payment-methods/register', {
      token: accessToken,
      data: { paymentMethodId: createdMethod.id, savedForFuture: true },
      expectedStatus: 200,
    });

    const { body: finalized } = await apiJson<{ order?: { status?: string; paymentCaptureStatus?: string } }>(
      request,
      'POST',
      '/account/checkout/finalize',
      { token: accessToken, data: { paymentIntentId }, expectedStatus: 201 },
    );
    expect(finalized.order?.status).toBe('confirmed');
    expect(finalized.order?.paymentCaptureStatus).toBe('authorized');

    const { body: methods } = await apiJson<{ paymentMethods?: Array<{ id?: string }> }>(
      request,
      'GET',
      '/account/payment-methods',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(methods.paymentMethods?.some((m) => m.id === createdMethod.id)).toBe(true);
  });
});
