import type { APIRequestContext } from 'patchright/test';
import Stripe from 'stripe';
import { pool } from '../../../src/db/pool.js';
import { loadStripeSecretKey } from '../../../scripts/envFile.js';
import {
  apiJson,
  createAddress,
  pickPurchasableVariant,
  testCourierCode,
  type PurchasableVariant,
} from './api.js';
import { loadTestEnv } from './env.js';
import { extractGuestManageToken, waitForMail } from './mail.js';
import { opsRequest } from './ops.js';

export function testStripe(): Stripe {
  const env = loadTestEnv();
  const stripeSecretKey = loadStripeSecretKey(env.root, env.mode);
  if (!stripeSecretKey) throw new Error('The loyalty API test requires STRIPE_SECRET_KEY.');
  return new Stripe(stripeSecretKey);
}

export async function creditCustomerWallet(
  request: APIRequestContext,
  adminToken: string,
  email: string,
  amount: number,
  reason: string,
): Promise<number> {
  const { body } = await apiJson<{ wallet?: { available?: number } }>(
    request,
    'POST',
    '/admin/loyalty/credit',
    {
      token: adminToken,
      data: { email, amount, reason },
      expectedStatus: 200,
    },
  );
  return body.wallet?.available ?? 0;
}

export interface LoyaltyPreview {
  enabled: boolean;
  loyaltyCredit: number;
  loyaltyEarn: number;
  incompatibleWithVoucher: boolean;
  availableBalance?: number;
  total: number;
}

export async function fetchAccountLoyaltyPreview(
  request: APIRequestContext,
  accessToken: string,
  params: {
    applyLoyalty?: boolean;
    voucherCode?: string;
    /** @deprecated Ignored — loyalty preview is merchandise-only. */
    addressId?: string;
    /** @deprecated Ignored — loyalty preview is merchandise-only. */
    courierCode?: string;
    express?: boolean;
  } = {},
): Promise<LoyaltyPreview> {
  const query = new URLSearchParams({
    applyLoyalty: String(params.applyLoyalty !== false),
  });
  if (params.voucherCode) query.set('voucherCode', params.voucherCode);
  const { body } = await apiJson<{ preview?: LoyaltyPreview }>(
    request,
    'GET',
    `/account/loyalty/preview?${query.toString()}`,
    { token: accessToken, expectedStatus: 200 },
  );
  if (!body.preview) throw new Error('loyalty preview missing preview payload');
  return body.preview;
}

export async function fetchAccountLoyaltyWallet(
  request: APIRequestContext,
  accessToken: string,
): Promise<{
  enabled: boolean;
  available: number;
  burnNoticeAmount: number | null;
  burnNoticeExpiresAt: string | null;
  burned: number;
}> {
  const { body } = await apiJson<{
    wallet?: {
      enabled?: boolean;
      available?: number;
      burnNoticeAmount?: number | null;
      burnNoticeExpiresAt?: string | null;
      burned?: number;
    };
  }>(request, 'GET', '/account/loyalty/wallet', {
    token: accessToken,
    expectedStatus: 200,
  });
  return {
    enabled: body.wallet?.enabled === true,
    available: body.wallet?.available ?? 0,
    burnNoticeAmount: body.wallet?.burnNoticeAmount ?? null,
    burnNoticeExpiresAt: body.wallet?.burnNoticeExpiresAt ?? null,
    burned: body.wallet?.burned ?? 0,
  };
}

export async function seedCartLine(
  request: APIRequestContext,
  accessToken: string,
  quantity = 1,
): Promise<{ addressId: string; variant: PurchasableVariant }> {
  const addressId = (await createAddress(request, accessToken)).id;
  const variant = await pickPurchasableVariant(request, { token: accessToken });
  await apiJson(request, 'POST', '/account/cart', {
    token: accessToken,
    data: {
      productId: variant.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
      quantity,
    },
    expectedStatus: 200,
  });
  return { addressId, variant };
}

export async function attachOneTimeVisaCard(
  request: APIRequestContext,
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
  if (!setupIntentId?.startsWith('seti_')) throw new Error('setup-intent missing client secret');
  const createdMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: { name: 'Loyalty E2E' },
  });
  const confirmedSetup = await stripe.setupIntents.confirm(setupIntentId, {
    payment_method: createdMethod.id,
  });
  if (confirmedSetup.status !== 'succeeded') {
    throw new Error(`setup-intent did not succeed: ${confirmedSetup.status}`);
  }
  await apiJson(request, 'POST', '/account/payment-methods/register', {
    token: accessToken,
    data: { paymentMethodId: createdMethod.id, savedForFuture: false },
    expectedStatus: 200,
  });
  return createdMethod.id;
}

export async function placePaidCardOrder(
  request: APIRequestContext,
  accessToken: string,
  opts: { applyLoyalty?: boolean; addressId?: string } = {},
): Promise<{
  orderId: string;
  orderNumber: string;
  loyaltyEarn: number;
  loyaltyCredit: number;
}> {
  const stripe = testStripe();
  // Reuse an existing cart/address when the caller already seeded a line for
  // preview assertions — a second seed of the same E2E SKU doubles quantity
  // and trips `size_unavailable` when stock is tight under parallel API workers.
  const addressId = opts.addressId ?? (await seedCartLine(request, accessToken)).addressId;
  const paymentMethodId = await attachOneTimeVisaCard(request, accessToken, stripe);
  const { body: intent } = await apiJson<{
    clientSecret?: string;
    loyaltyEarn?: number;
    loyaltyCredit?: number;
  }>(request, 'POST', '/account/checkout/create-intent', {
    token: accessToken,
    data: {
      addressId,
      courierCode: testCourierCode,
      express: false,
      paymentMethodId,
      applyLoyalty: opts.applyLoyalty !== false,
    },
    expectedStatus: 200,
  });
  const paymentIntentId = intent.clientSecret?.split('_secret_')[0];
  if (!paymentIntentId?.startsWith('pi_')) throw new Error('create-intent missing payment intent');
  const authorized = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId,
    return_url: 'http://localhost:5173/cart',
  });
  if (authorized.status !== 'requires_capture') {
    throw new Error(`payment intent did not authorize: ${authorized.status}`);
  }
  const { body: finalized } = await apiJson<{
    order?: { id?: string; orderNumber?: string; loyaltyEarn?: number; loyaltyCredit?: number };
  }>(request, 'POST', '/account/checkout/finalize', {
    token: accessToken,
    data: { paymentIntentId },
    expectedStatus: 201,
  });
  const order = finalized.order;
  if (!order?.id || !order.orderNumber) throw new Error('finalize returned no order');
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    loyaltyEarn: order.loyaltyEarn ?? intent.loyaltyEarn ?? 0,
    loyaltyCredit: order.loyaltyCredit ?? intent.loyaltyCredit ?? 0,
  };
}

const guestAddress = {
  recipientName: 'Loyalty Guest',
  line1: '10 rue de Test',
  postalCode: '75001',
  city: 'Paris',
  countryCode: 'FR',
  phone: '+33601020304',
};

/** Paid guest order that can earn loyalty (merchandise not zeroed). */
export async function placeGuestPaidCardOrder(
  request: APIRequestContext,
  email: string,
): Promise<{
  orderId: string;
  orderNumber: string;
  integrityToken: string;
  manageToken: string;
  loyaltyEarn: number;
}> {
  const stripe = testStripe();
  const variant = await pickPurchasableVariant(request);
  const sinceMs = Date.now() - 1_000;
  const { body: intent } = await apiJson<{
    clientSecret?: string;
    loyaltyEarn?: number;
  }>(request, 'POST', '/checkout/guest/create-intent', {
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
      address: guestAddress,
      courierCode: testCourierCode,
      express: false,
      email,
      gdprConsent: { accepted: true },
      language: 'fr',
    },
    expectedStatus: 200,
  });
  const paymentIntentId = intent.clientSecret?.split('_secret_')[0];
  if (!paymentIntentId?.startsWith('pi_')) {
    throw new Error('guest create-intent missing payment intent');
  }
  const card = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: { name: 'Loyalty Guest', email },
  });
  const authorized = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: card.id,
    return_url: 'http://localhost:5173/cart',
  });
  if (authorized.status !== 'requires_capture' && authorized.status !== 'succeeded') {
    throw new Error(`guest payment intent did not authorize: ${authorized.status}`);
  }
  const { body: finalized } = await apiJson<{
    order?: {
      id?: string;
      orderNumber?: string;
      integrityToken?: string | null;
      loyaltyEarn?: number;
    };
  }>(request, 'POST', '/checkout/guest/finalize', {
    data: { paymentIntentId },
    expectedStatus: 201,
  });
  const order = finalized.order;
  if (!order?.id || !order.orderNumber || !order.integrityToken) {
    throw new Error('guest finalize returned incomplete order');
  }
  const mail = await waitForMail({
    kind: 'user',
    toIncludes: email,
    subjectIncludes: 'Confirmation de votre commande',
    sinceMs,
    timeoutMs: 15_000,
  });
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    integrityToken: order.integrityToken,
    manageToken: extractGuestManageToken(mail),
    loyaltyEarn: order.loyaltyEarn ?? intent.loyaltyEarn ?? 0,
  };
}

export async function advanceOrderToReceived(
  request: APIRequestContext,
  adminToken: string,
  orderId: string,
): Promise<void> {
  await apiJson(request, 'PATCH', `/admin/orders/${orderId}/status`, {
    token: adminToken,
    data: { status: 'in_preparation' },
    expectedStatus: 200,
  });
  await apiJson(request, 'PATCH', `/admin/orders/${orderId}/status`, {
    token: adminToken,
    data: { status: 'to_send', skipShippingLabel: true },
    expectedStatus: 200,
  });
  await apiJson(request, 'PATCH', `/admin/orders/${orderId}/status`, {
    token: adminToken,
    data: { status: 'sent' },
    expectedStatus: 200,
  });
  await apiJson(request, 'PATCH', `/admin/orders/${orderId}/status`, {
    token: adminToken,
    data: { advanceToReceived: true },
    expectedStatus: 200,
  });
}

export async function verifyReceivedOrder(
  request: APIRequestContext,
  adminToken: string,
  orderId: string,
): Promise<void> {
  await apiJson(request, 'POST', `/admin/orders/${orderId}/verify`, {
    token: adminToken,
    expectedStatus: 200,
  });
}

/** Move active lots into the burn-notice window (or past expiry) for tests. */
export async function forceActiveLotsExpiresAt(userId: string, expiresAt: Date): Promise<number> {
  const result = await pool.query(
    `update loyalty_lots
        set expires_at = $2, updated_at = now()
      where user_id = $1 and status = 'active' and remaining > 0`,
    [userId, expiresAt.toISOString()],
  );
  return result.rowCount ?? 0;
}

/** Force every lot for the user (including depleted) past a calendar cut-off. */
export async function forceAllLotsExpiresAt(userId: string, expiresAt: Date): Promise<number> {
  const result = await pool.query(
    `update loyalty_lots
        set expires_at = $2, updated_at = now()
      where user_id = $1`,
    [userId, expiresAt.toISOString()],
  );
  return result.rowCount ?? 0;
}

/** Expire open loyalty holds so process-loyalty can release them. */
export async function forceHeldLoyaltyExpiresAt(userId: string, expiresAt: Date): Promise<number> {
  const result = await pool.query(
    `update loyalty_holds
        set expires_at = $2, updated_at = now()
      where user_id = $1 and state = 'held'`,
    [userId, expiresAt.toISOString()],
  );
  return result.rowCount ?? 0;
}

export async function processLoyaltyMaintenance(): Promise<{
  holdsReleased: number;
  expiredTotal: number;
}> {
  const { status, json } = await opsRequest('POST', '/operation/process-loyalty');
  if (status !== 200 || json.success !== true) {
    throw new Error(`[ops] process-loyalty failed: ${status} ${JSON.stringify(json)}`);
  }
  return {
    holdsReleased: Number(json.holdsReleased ?? 0),
    expiredTotal: Number(json.expiredTotal ?? 0),
  };
}

export async function expireDueLoyaltyLots(): Promise<number> {
  return (await processLoyaltyMaintenance()).expiredTotal;
}

/** After received+verify, rewind status so return-review can open while earn stays granted. */
export async function reopenSentForReturnReview(orderId: string): Promise<void> {
  const result = await pool.query(
    `update orders
        set status = 'sent',
            admin_verified_at = null,
            status_updated_at = now(),
            updated_at = now()
      where id = $1 and status = 'received' and loyalty_granted_at is not null`,
    [orderId],
  );
  if ((result.rowCount ?? 0) !== 1) {
    throw new Error(`reopenSentForReturnReview failed for ${orderId}`);
  }
}

export async function advanceOrderToReturnReview(
  request: APIRequestContext,
  adminToken: string,
  orderId: string,
): Promise<void> {
  await apiJson(request, 'PATCH', `/admin/orders/${orderId}/status`, {
    token: adminToken,
    data: { advanceToReturnReview: true },
    expectedStatus: 200,
  });
}

export async function resolveOrderReturnFull(
  request: APIRequestContext,
  adminToken: string,
  orderId: string,
  decisionReason: string,
): Promise<{
  refundAmountCents: number;
  loyaltyEarnRetainedCents: number;
  resolutionState: string;
}> {
  const { body: detail } = await apiJson<{
    order?: {
      returnReview?: {
        stockLines?: Array<{
          productUid: string;
          shapeKey: string;
          lengthKey: string;
          size: string;
          maxRestockUnits: number | null;
          productAvailable: boolean;
        }>;
      };
    };
  }>(request, 'GET', `/admin/orders/${orderId}`, {
    token: adminToken,
    expectedStatus: 200,
  });
  const { body: previewBody } = await apiJson<{
    preview?: {
      remainingRefundableCents: number;
      courierDefaultCents: number;
      loyaltyEarnRetainedCents: number;
    };
  }>(request, 'GET', `/admin/orders/${orderId}/return-review/financial-preview`, {
    token: adminToken,
    expectedStatus: 200,
  });
  const stock = (detail.order?.returnReview?.stockLines ?? []).map((line) => ({
    productUid: line.productUid,
    shapeKey: line.shapeKey,
    lengthKey: line.lengthKey,
    size: line.size,
    quantity: line.productAvailable ? (line.maxRestockUnits ?? 0) : 0,
  }));
  const { body: resolved } = await apiJson<{
    order?: {
      returnReview?: {
        resolutionState?: string;
        refundAmountCents?: number;
        loyaltyEarnRetainedCents?: number;
      };
    };
  }>(request, 'POST', `/admin/orders/${orderId}/return-review/resolve`, {
    token: adminToken,
    data: {
      refundMode: 'full',
      courierRetainedCents: 0,
      decisionReason,
      stock,
      confirmed: true,
    },
    expectedStatus: 200,
  });
  return {
    refundAmountCents: resolved.order?.returnReview?.refundAmountCents ?? 0,
    loyaltyEarnRetainedCents:
      resolved.order?.returnReview?.loyaltyEarnRetainedCents ??
      previewBody.preview?.loyaltyEarnRetainedCents ??
      0,
    resolutionState: resolved.order?.returnReview?.resolutionState ?? '',
  };
}
