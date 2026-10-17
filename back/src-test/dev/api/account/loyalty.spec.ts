import { test, expect } from 'patchright/test';
import {
  apiJson,
  enableAllShopPaymentMethods,
  registerAdmin,
  registerUser,
  testCourierCode,
  uniqueEmail,
} from '../../support/api.js';
import { initVoucher } from '../../support/ops.js';
import {
  advanceOrderToReceived,
  advanceOrderToReturnReview,
  attachOneTimeVisaCard,
  creditCustomerWallet,
  expireDueLoyaltyLots,
  fetchAccountLoyaltyPreview,
  fetchAccountLoyaltyWallet,
  forceActiveLotsExpiresAt,
  forceAllLotsExpiresAt,
  forceHeldLoyaltyExpiresAt,
  placeGuestPaidCardOrder,
  placePaidCardOrder,
  processLoyaltyMaintenance,
  reopenSentForReturnReview,
  resolveOrderReturnFull,
  seedCartLine,
  testStripe,
  verifyReceivedOrder,
} from '../../support/loyalty.js';

test.describe('API account loyalty', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
    const admin = await registerAdmin(request);
    adminToken = admin.accessToken;
  });

  test('wallet and ledger: reflect an admin credit', async ({ request }) => {
    const customer = await registerUser(request);
    const available = await creditCustomerWallet(
      request,
      adminToken,
      customer.email,
      12.5,
      'API loyalty wallet test',
    );
    expect(available).toBeCloseTo(12.5, 2);

    const { body: wallet } = await apiJson<{ wallet?: { enabled?: boolean; available?: number } }>(
      request,
      'GET',
      '/account/loyalty/wallet',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(wallet.wallet?.enabled).toBe(true);
    expect(wallet.wallet?.available).toBeCloseTo(12.5, 2);

    const { body: ledger } = await apiJson<{ entries?: Array<{ kind?: string; amount?: number }> }>(
      request,
      'GET',
      '/account/loyalty/ledger?page=1&pageSize=5',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(ledger.entries?.some((entry) => entry.kind === 'credit_manual' && entry.amount === 12.5)).toBe(
      true,
    );
  });

  test('preview earn: ignores wallet spend when applyLoyalty is false', async ({ request }) => {
    const customer = await registerUser(request);
    await seedCartLine(request, customer.accessToken);
    await creditCustomerWallet(request, adminToken, customer.email, 25, 'preview spend disabled');

    const preview = await fetchAccountLoyaltyPreview(request, customer.accessToken, {
      applyLoyalty: false,
    });
    expect(preview.enabled).toBe(true);
    expect(preview.loyaltyCredit).toBe(0);
    expect(preview.loyaltyEarn).toBeGreaterThan(0);
  });

  test('preview: works without address or courier', async ({ request }) => {
    const customer = await registerUser(request);
    await seedCartLine(request, customer.accessToken);

    const preview = await fetchAccountLoyaltyPreview(request, customer.accessToken, {
      applyLoyalty: false,
    });
    expect(preview.enabled).toBe(true);
    expect(preview.loyaltyEarn).toBeGreaterThan(0);
  });

  test('preview earn: drops when wallet credit is applied', async ({ request }) => {
    const customer = await registerUser(request);
    const { addressId } = await seedCartLine(request, customer.accessToken);
    await creditCustomerWallet(request, adminToken, customer.email, 5, 'preview partial wallet');

    const withoutWallet = await fetchAccountLoyaltyPreview(request, customer.accessToken, {
      addressId,
      applyLoyalty: false,
    });
    const withWallet = await fetchAccountLoyaltyPreview(request, customer.accessToken, {
      addressId,
      applyLoyalty: true,
    });

    expect(withWallet.loyaltyCredit).toBeCloseTo(5, 2);
    expect(withWallet.loyaltyEarn).toBeGreaterThan(0);
    expect(withWallet.loyaltyEarn).toBeLessThan(withoutWallet.loyaltyEarn);
  });

  test('preview earn: is zero when wallet covers merchandise', async ({ request }) => {
    const customer = await registerUser(request);
    const { addressId } = await seedCartLine(request, customer.accessToken);
    await creditCustomerWallet(request, adminToken, customer.email, 10_000, 'preview full wallet');

    const preview = await fetchAccountLoyaltyPreview(request, customer.accessToken, {
      addressId,
      applyLoyalty: true,
    });
    expect(preview.loyaltyCredit).toBeGreaterThan(0);
    expect(preview.loyaltyEarn).toBe(0);
  });

  test('active voucher: marks wallet use incompatible and blocks credit', async ({ request }) => {
    const stamp = Date.now();
    const customer = await registerUser(request);
    const { addressId } = await seedCartLine(request, customer.accessToken);
    await creditCustomerWallet(request, adminToken, customer.email, 8, 'voucher incompatibility');

    const created = await initVoucher(`e2e-loy-${stamp}`, { kind: 'percent', percent: 10 }, { maxPerUser: 0 });
    const code =
      (created as { voucher?: { code?: string }; code?: string }).voucher?.code ??
      (created as { code?: string }).code;
    if (!code) throw new Error('voucher init returned no code');

    const preview = await fetchAccountLoyaltyPreview(request, customer.accessToken, {
      addressId,
      applyLoyalty: true,
      voucherCode: code,
    });
    expect(preview.incompatibleWithVoucher).toBe(true);
    expect(preview.loyaltyCredit).toBe(0);
    expect(preview.loyaltyEarn).toBeGreaterThan(0);
  });

  test('verified received order: admin verification grants loyalty', async ({ request }) => {
    const customer = await registerUser(request);
    const { body: before } = await apiJson<{ wallet?: { available?: number } }>(
      request,
      'GET',
      '/account/loyalty/wallet',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    const placed = await placePaidCardOrder(request, customer.accessToken, { applyLoyalty: false });
    expect(placed.loyaltyEarn).toBeGreaterThan(0);

    await advanceOrderToReceived(request, adminToken, placed.orderId);
    await apiJson(request, 'POST', `/admin/orders/${placed.orderId}/verify`, {
      token: adminToken,
      expectedStatus: 200,
    });

    const { body: after } = await apiJson<{ wallet?: { available?: number } }>(
      request,
      'GET',
      '/account/loyalty/wallet',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(after.wallet?.available).toBeCloseTo(
      (before.wallet?.available ?? 0) + placed.loyaltyEarn,
      2,
    );

    const { body: ledger } = await apiJson<{ entries?: Array<{ kind?: string; amount?: number }> }>(
      request,
      'GET',
      '/account/loyalty/ledger?page=1&pageSize=10',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(ledger.entries?.some((entry) => entry.kind === 'earn' && entry.amount === placed.loyaltyEarn)).toBe(
      true,
    );
  });

  test('guest earn: grants after claim of a verified received order', async ({ request }) => {
    const email = uniqueEmail('loy-guest');
    const guestOrder = await placeGuestPaidCardOrder(request, email);
    expect(guestOrder.loyaltyEarn).toBeGreaterThan(0);

    await advanceOrderToReceived(request, adminToken, guestOrder.orderId);
    await verifyReceivedOrder(request, adminToken, guestOrder.orderId);

    const account = await registerUser(request, { email });
    await apiJson(request, 'POST', `/account/guest-orders/${guestOrder.orderId}/claim`, {
      token: account.accessToken,
      data: { integrityToken: guestOrder.integrityToken },
      expectedStatus: 200,
    });

    const wallet = await fetchAccountLoyaltyWallet(request, account.accessToken);
    expect(wallet.available).toBeCloseTo(guestOrder.loyaltyEarn, 2);

    const { body: ledger } = await apiJson<{ entries?: Array<{ kind?: string; amount?: number }> }>(
      request,
      'GET',
      '/account/loyalty/ledger?page=1&pageSize=10',
      { token: account.accessToken, expectedStatus: 200 },
    );
    expect(
      ledger.entries?.some((entry) => entry.kind === 'earn' && entry.amount === guestOrder.loyaltyEarn),
    ).toBe(true);
  });

  test('checkout: spends wallet credit and burn notice appears then expires', async ({ request }) => {
    const customer = await registerUser(request);
    const userId = String(customer.user.id ?? '');
    expect(userId.length).toBeGreaterThan(0);

    await creditCustomerWallet(request, adminToken, customer.email, 8, 'spend then burn');
    const placed = await placePaidCardOrder(request, customer.accessToken, { applyLoyalty: true });
    expect(placed.loyaltyCredit).toBeGreaterThan(0);

    const afterSpend = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(afterSpend.available).toBeLessThan(8);

    await creditCustomerWallet(request, adminToken, customer.email, 4, 'burn notice credit');
    const noticeExpires = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const moved = await forceActiveLotsExpiresAt(userId, noticeExpires);
    expect(moved).toBeGreaterThan(0);

    const withNotice = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(withNotice.burnNoticeAmount ?? 0).toBeGreaterThan(0);
    expect(withNotice.burnNoticeExpiresAt).toBeTruthy();

    await forceActiveLotsExpiresAt(userId, new Date(Date.now() - 1_000));
    const expiredTotal = await expireDueLoyaltyLots();
    expect(expiredTotal).toBeGreaterThan(0);

    const afterBurn = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(afterBurn.available).toBe(0);
    expect(afterBurn.burned).toBeGreaterThan(0);
    expect(afterBurn.burnNoticeAmount ?? 0).toBe(0);
  });

  test('omitted applyLoyalty: wallet credit is not spent', async ({ request }) => {
    const customer = await registerUser(request);
    await creditCustomerWallet(request, adminToken, customer.email, 20, 'omit applyLoyalty');
    const { addressId } = await seedCartLine(request, customer.accessToken);
    const stripe = testStripe();
    const paymentMethodId = await attachOneTimeVisaCard(request, customer.accessToken, stripe);

    const { body: intent } = await apiJson<{
      clientSecret?: string;
      loyaltyCredit?: number;
      loyaltyEarn?: number;
    }>(request, 'POST', '/account/checkout/create-intent', {
      token: customer.accessToken,
      data: {
        addressId,
        courierCode: testCourierCode,
        express: false,
        paymentMethodId,
        // applyLoyalty intentionally omitted
      },
      expectedStatus: 200,
    });
    expect(intent.loyaltyCredit ?? 0).toBe(0);
    expect(intent.loyaltyEarn ?? 0).toBeGreaterThan(0);

    const paymentIntentId = intent.clientSecret?.split('_secret_')[0];
    expect(paymentIntentId?.startsWith('pi_')).toBe(true);
    await apiJson(request, 'POST', '/account/checkout/cancel', {
      token: customer.accessToken,
      data: { paymentIntentId },
      expectedStatus: 200,
    });

    const wallet = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(wallet.available).toBeCloseTo(20, 2);
  });

  test('expired: hold is released by process-loyalty without freezing credit', async ({ request }) => {
    const customer = await registerUser(request);
    const userId = String(customer.user.id ?? '');
    await creditCustomerWallet(request, adminToken, customer.email, 15, 'hold ttl');
    const { addressId } = await seedCartLine(request, customer.accessToken);
    const stripe = testStripe();
    const paymentMethodId = await attachOneTimeVisaCard(request, customer.accessToken, stripe);

    const { body: intent } = await apiJson<{ clientSecret?: string; loyaltyCredit?: number }>(
      request,
      'POST',
      '/account/checkout/create-intent',
      {
        token: customer.accessToken,
        data: {
          addressId,
          courierCode: testCourierCode,
          express: false,
          paymentMethodId,
          applyLoyalty: true,
        },
        expectedStatus: 200,
      },
    );
    expect(intent.loyaltyCredit ?? 0).toBeGreaterThan(0);
    const midHold = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(midHold.available).toBeLessThan(15);

    expect(await forceHeldLoyaltyExpiresAt(userId, new Date(Date.now() - 1_000))).toBeGreaterThan(0);
    const maintenance = await processLoyaltyMaintenance();
    expect(maintenance.holdsReleased).toBeGreaterThan(0);

    const restored = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(restored.available).toBeCloseTo(15, 2);

    const paymentIntentId = intent.clientSecret?.split('_secret_')[0];
    if (paymentIntentId) {
      await apiJson(request, 'POST', '/account/checkout/cancel', {
        token: customer.accessToken,
        data: { paymentIntentId },
        expectedStatus: 200,
      });
    }
  });

  test('overlapping expiry: writes a single expire ledger row', async ({ request }) => {
    const customer = await registerUser(request);
    const userId = String(customer.user.id ?? '');
    await creditCustomerWallet(request, adminToken, customer.email, 6, 'double expire');
    expect(await forceActiveLotsExpiresAt(userId, new Date(Date.now() - 1_000))).toBeGreaterThan(0);

    const first = await processLoyaltyMaintenance();
    const second = await processLoyaltyMaintenance();
    expect(first.expiredTotal).toBeGreaterThan(0);
    expect(second.expiredTotal).toBe(0);

    const { body: ledger } = await apiJson<{ entries?: Array<{ kind?: string }> }>(
      request,
      'GET',
      '/account/loyalty/ledger?page=1&pageSize=20',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(ledger.entries?.filter((entry) => entry.kind === 'expire')).toHaveLength(1);

    const wallet = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(wallet.available).toBe(0);
  });

  test('cancel after lot expiry does not restore spendable: credit on expired lots', async ({
    request,
  }) => {
    const customer = await registerUser(request);
    const userId = String(customer.user.id ?? '');
    await creditCustomerWallet(request, adminToken, customer.email, 9, 'refund after expiry');
    const placed = await placePaidCardOrder(request, customer.accessToken, { applyLoyalty: true });
    expect(placed.loyaltyCredit).toBeGreaterThan(0);

    expect(await forceAllLotsExpiresAt(userId, new Date(Date.now() - 1_000))).toBeGreaterThan(0);
    await apiJson(request, 'DELETE', `/account/orders/${placed.orderId}`, {
      token: customer.accessToken,
      expectedStatus: 200,
    });

    const wallet = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(wallet.available).toBe(0);

    const { body: ledger } = await apiJson<{ entries?: Array<{ kind?: string }> }>(
      request,
      'GET',
      '/account/loyalty/ledger?page=1&pageSize=30',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(ledger.entries?.some((entry) => entry.kind === 'spend_refund')).toBe(true);
    expect(ledger.entries?.some((entry) => entry.kind === 'expire')).toBe(true);
  });

  test('return: reverses unused granted earn without reducing the cash refund', async ({
    request,
  }) => {
    const customer = await registerUser(request);
    const placed = await placePaidCardOrder(request, customer.accessToken, { applyLoyalty: false });
    expect(placed.loyaltyEarn).toBeGreaterThan(0);
    await advanceOrderToReceived(request, adminToken, placed.orderId);
    await verifyReceivedOrder(request, adminToken, placed.orderId);

    const before = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(before.available).toBeCloseTo(placed.loyaltyEarn, 2);

    await reopenSentForReturnReview(placed.orderId);
    await advanceOrderToReturnReview(request, adminToken, placed.orderId);

    const { body: previewBody } = await apiJson<{
      preview?: { remainingRefundableCents: number; loyaltyEarnRetainedCents: number };
    }>(request, 'GET', `/admin/orders/${placed.orderId}/return-review/financial-preview`, {
      token: adminToken,
      expectedStatus: 200,
    });
    expect(previewBody.preview?.loyaltyEarnRetainedCents ?? -1).toBe(0);
    const remaining = previewBody.preview?.remainingRefundableCents ?? 0;
    expect(remaining).toBeGreaterThan(0);

    const resolved = await resolveOrderReturnFull(
      request,
      adminToken,
      placed.orderId,
      'Loyalty unused earn reverse',
    );
    expect(resolved.resolutionState).toBe('resolved');
    expect(resolved.loyaltyEarnRetainedCents).toBe(0);
    expect(resolved.refundAmountCents).toBe(remaining);

    const after = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(after.available).toBe(0);

    const { body: ledger } = await apiJson<{ entries?: Array<{ kind?: string }> }>(
      request,
      'GET',
      '/account/loyalty/ledger?page=1&pageSize=30',
      { token: customer.accessToken, expectedStatus: 200 },
    );
    expect(ledger.entries?.some((entry) => entry.kind === 'earn_reversal')).toBe(true);

    const { body: afterResolve } = await apiJson<{
      order?: {
        status?: string;
        returnReview?: {
          resolutionState?: string;
          refundAmountCents?: number;
          loyaltyEarnRetainedCents?: number;
        };
      };
    }>(request, 'GET', `/admin/orders/${placed.orderId}`, {
      token: adminToken,
      expectedStatus: 200,
    });
    expect(afterResolve.order?.status).toBe('cancelled');
    expect(afterResolve.order?.returnReview?.resolutionState).toBe('resolved');
    expect(afterResolve.order?.returnReview?.refundAmountCents).toBe(resolved.refundAmountCents);
    expect(afterResolve.order?.returnReview?.loyaltyEarnRetainedCents ?? 0).toBe(0);
  });

  test('return: retains spent earn on the cash refund and leaves other lots alone', async ({
    request,
  }) => {
    const customer = await registerUser(request);
    const placedA = await placePaidCardOrder(request, customer.accessToken, { applyLoyalty: false });
    expect(placedA.loyaltyEarn).toBeGreaterThan(0);
    await advanceOrderToReceived(request, adminToken, placedA.orderId);
    await verifyReceivedOrder(request, adminToken, placedA.orderId);

    const afterGrant = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(afterGrant.available).toBeCloseTo(placedA.loyaltyEarn, 2);

    await creditCustomerWallet(request, adminToken, customer.email, 50, 'untouched other lot');
    const withExtra = await fetchAccountLoyaltyWallet(request, customer.accessToken);

    const placedB = await placePaidCardOrder(request, customer.accessToken, { applyLoyalty: true });
    expect(placedB.loyaltyCredit).toBeGreaterThan(0);
    // FIFO spends the older order-earn lot first.
    expect(placedB.loyaltyCredit).toBeGreaterThanOrEqual(placedA.loyaltyEarn);

    const mid = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    expect(mid.available).toBeCloseTo(withExtra.available - placedB.loyaltyCredit, 2);

    await reopenSentForReturnReview(placedA.orderId);
    await advanceOrderToReturnReview(request, adminToken, placedA.orderId);

    const { body: previewBody } = await apiJson<{
      preview?: { remainingRefundableCents: number; loyaltyEarnRetainedCents: number };
    }>(request, 'GET', `/admin/orders/${placedA.orderId}/return-review/financial-preview`, {
      token: adminToken,
      expectedStatus: 200,
    });
    const earnRetained = previewBody.preview?.loyaltyEarnRetainedCents ?? 0;
    const remaining = previewBody.preview?.remainingRefundableCents ?? 0;
    expect(earnRetained).toBe(Math.round(placedA.loyaltyEarn * 100));
    expect(remaining).toBeGreaterThan(earnRetained);

    const resolved = await resolveOrderReturnFull(
      request,
      adminToken,
      placedA.orderId,
      'Loyalty spent earn retained',
    );
    expect(resolved.resolutionState).toBe('resolved');
    expect(resolved.loyaltyEarnRetainedCents).toBe(earnRetained);
    expect(resolved.refundAmountCents).toBe(Math.max(0, remaining - earnRetained));

    const after = await fetchAccountLoyaltyWallet(request, customer.accessToken);
    // Other lot (manual credit remainder) must not be drained to claw back spent earn.
    expect(after.available).toBeCloseTo(mid.available, 2);
  });
});

test.describe('API admin loyalty', () => {
  test('credit and uncredit stay consistent', async ({ request }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);
    const userId = String(customer.user.id ?? '');
    expect(userId.length).toBeGreaterThan(0);

    await apiJson(request, 'PATCH', '/admin/loyalty/settings', {
      token: admin.accessToken,
      data: { valuePer100: 7.5 },
      expectedStatus: 404,
    });

    await creditCustomerWallet(request, admin.accessToken, customer.email, 4, 'admin credit test');
    const { body: wallet } = await apiJson<{ wallet?: { available?: number } }>(
      request,
      'GET',
      `/admin/loyalty/users/${userId}/wallet`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(wallet.wallet?.available).toBeCloseTo(4, 2);

    await apiJson(request, 'POST', '/admin/loyalty/uncredit', {
      token: admin.accessToken,
      data: { email: customer.email, amount: 1.5, reason: 'admin uncredit test' },
      expectedStatus: 200,
    });

    const { body: manualOps } = await apiJson<{ entries?: unknown[] }>(
      request,
      'GET',
      '/admin/loyalty/manual-ops?page=1&pageSize=5',
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect((manualOps.entries ?? []).length).toBeGreaterThan(0);
  });
});
