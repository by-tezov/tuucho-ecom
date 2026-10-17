import { test, expect } from 'patchright/test';
import {
  apiJson,
  createZeroingVoucher,
  placeFreeOrder,
  registerAdmin,
  registerUser,
} from '../../support/api.js';
import { advanceOrderToSent, opsRequest } from '../../support/ops.js';
import { pool } from '../../../../src/db/pool.js';
import { getById } from '../../../../src/modules/orders/application/ordersFacade.js';
import { applyCarrierReturnSignal } from '../../../../src/modules/orders/application/returns/orderReturnTracking.js';

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type AdminOrderSummary = {
  id: string;
  orderNumber: string;
  userEmail: string | null;
  itemCount: number;
  total: number;
  adminVerified: boolean;
};

/** Finds one order across the admin pager rather than assuming it landed on
 * page 1 — the disposable database accumulates orders from every spec. */
async function findAdminOrder(
  request: Parameters<typeof apiJson>[0],
  token: string,
  status: string,
  orderId: string,
): Promise<AdminOrderSummary | undefined> {
  let page = 1;
  let totalPages = 1;
  do {
    const { body } = await apiJson<{ orders?: AdminOrderSummary[]; pagination?: Pagination }>(
      request,
      'GET',
      `/admin/orders?status=${status}&page=${page}`,
      { token, expectedStatus: 200 },
    );
    const hit = (body.orders ?? []).find((entry) => entry.id === orderId);
    if (hit) return hit;
    totalPages = body.pagination?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages && page <= 10);
  return undefined;
}

test.describe('API admin dashboard', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('admin');
  });

  test('every administration route: refuses a customer and an impersonation token', async ({ request }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);

    const reads = [
      '/admin/stats',
      '/admin/orders/attention-counts',
      '/admin/orders?status=confirmed',
      '/admin/library-stock',
      '/admin/accessory-stock',
      '/admin/user-library-stock',
      '/admin/cart-rules',
      '/admin/vouchers',
      '/admin/preferences',
      '/admin/chats/attention-counts',
      '/admin/product-requests/attention-counts',
      '/admin/unconnected-contacts/attention-counts',
    ];
    for (const path of reads) {
      const { body } = await apiJson<{ error?: { code?: string } }>(request, 'GET', path, {
        token: customer.accessToken,
        expectedStatus: 403,
      });
      expect(body.error?.code).toBe('forbidden');
      await apiJson(request, 'GET', path, { expectedStatus: 401 });
      await apiJson(request, 'GET', path, { token: admin.accessToken, expectedStatus: 200 });
    }

    // An administrator may act as a customer, but that borrowed session must
    // never carry administration rights back with it.
    const { body: impersonated } = await apiJson<{
      accessToken?: string;
      user?: { email?: string; role?: string };
    }>(request, 'POST', '/admin/impersonate', {
      token: admin.accessToken,
      data: { email: customer.email },
      expectedStatus: 200,
    });
    expect(impersonated.user?.email).toBe(customer.email);
    expect(impersonated.accessToken).toBeTruthy();
    const { body: profile } = await apiJson<{ user?: { email?: string } }>(
      request,
      'GET',
      '/account/profile',
      { token: impersonated.accessToken, expectedStatus: 200 },
    );
    expect(profile.user?.email).toBe(customer.email);
    const { body: refused } = await apiJson<{ error?: { code?: string } }>(request, 'GET', '/admin/stats', {
      token: impersonated.accessToken,
      expectedStatus: 403,
    });
    expect(refused.error?.code).toBe('forbidden');

    // An impersonation session is not a login, so it leaves no trace in the
    // customer's own recent-logins block.
    const { body: logins } = await apiJson<{ logins?: unknown[] }>(request, 'GET', '/account/recent-logins', {
      token: customer.accessToken,
      expectedStatus: 200,
    });
    expect(logins.logins).toHaveLength(1);

    await apiJson(request, 'POST', '/admin/impersonate', {
      token: admin.accessToken,
      data: {},
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', '/admin/impersonate', {
      token: admin.accessToken,
      data: { email: 'nobody@pamsurin.test' },
      expectedStatus: 404,
    });
    // Administrators cannot be impersonated, not even by another one.
    const { body: notAllowed } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/admin/impersonate',
      { token: admin.accessToken, data: { email: admin.email }, expectedStatus: 409 },
    );
    expect(notAllowed.error?.code).toBe('impersonation_not_allowed');
  });

  test('stats and attention: counts describe the live shop', async ({ request }) => {
    const admin = await registerAdmin(request);

    const { body: stats } = await apiJson<{
      library?: {
        quantity: number;
        stockValue: number;
        averageUnitPrice: number | null;
        bySize?: Record<string, { quantity: number; stockValue: number }>;
      };
      accessories?: { quantity: number; stockValue: number };
      orders?: Record<string, number>;
    }>(request, 'GET', '/admin/stats', { token: admin.accessToken, expectedStatus: 200 });
    expect(stats.library?.quantity).toBeGreaterThan(0);
    expect(stats.library?.stockValue).toBeGreaterThanOrEqual(0);
    for (const size of ['XS', 'S', 'M', 'L']) {
      expect(stats.library?.bySize?.[size]).toBeTruthy();
    }
    expect(stats.accessories?.quantity).toBeGreaterThanOrEqual(0);
    for (const key of [
      'confirmed',
      'sent',
      'received',
      'cancelled',
      'merchandiseSold',
      'shippingPaid',
      'totalSold',
    ]) {
      expect(typeof stats.orders?.[key]).toBe('number');
    }

    const { body: counts } = await apiJson<{
      counts?: {
        confirmed: number;
        disponible: number;
        needReview: number;
        returnReview: number;
        receivedUnverified: number;
        cancelledUnverified: number;
      };
    }>(request, 'GET', '/admin/orders/attention-counts', {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    for (const key of [
      'confirmed',
      'disponible',
      'needReview',
      'returnReview',
      'receivedUnverified',
      'cancelledUnverified',
    ] as const) {
      expect(typeof counts.counts?.[key]).toBe('number');
    }

    for (const hub of ['chats', 'product-requests', 'unconnected-contacts']) {
      const { body } = await apiJson<{ counts?: Record<string, number> }>(
        request,
        'GET',
        `/admin/${hub}/attention-counts`,
        { token: admin.accessToken, expectedStatus: 200 },
      );
      expect(body.counts).toBeTruthy();
    }
  });

  test('payment exceptions: they stay queued until a human Stripe review', async ({
    request,
  }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);
    const { order } = await placeFreeOrder(request, customer.accessToken, { voucherCode });

    const { body: reviewPage } = await apiJson<{
      orders?: Array<{ id: string }>;
      pagination?: Pagination;
    }>(request, 'GET', '/admin/orders?status=need_review', {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(reviewPage.orders?.some((entry) => entry.id === order.id)).toBe(false);
    expect(reviewPage.pagination?.page).toBe(1);

    // A resolution must explicitly acknowledge the out-of-band Stripe review.
    await apiJson(request, 'POST', `/admin/orders/${order.id}/need-review-resolution`, {
      token: admin.accessToken,
      data: { decision: 'continue' },
      expectedStatus: 400,
    });
    const { body: refused } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      `/admin/orders/${order.id}/need-review-resolution`,
      { token: admin.accessToken, data: { decision: 'continue', confirmed: true }, expectedStatus: 409 },
    );
    expect(refused.error?.code).toBe('invalid_status');

    // The normal operations lifecycle cannot manufacture or resolve `need_review`.
    const operation = await opsRequest('PATCH', `/operation/orders/${order.id}/status`, {
      status: 'need_review',
    });
    expect(operation.status).toBe(400);
    expect(operation.json.message).toContain('browser admin dashboard');

    const { body: unchanged } = await apiJson<{ order?: { status?: string; statusReason?: string | null } }>(
      request,
      'GET',
      `/admin/orders/${order.id}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(unchanged.order?.status).toBe('confirmed');
    expect(unchanged.order?.statusReason).toBeNull();
  });

  test('detects an unclaimed parcel and requires an idempotent human: return decision', async ({
    request,
  }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);
    const { order } = await placeFreeOrder(request, customer.accessToken, { voucherCode });
    await advanceOrderToSent(order.orderNumber, { skipLabel: true });

    const sentOrder = await getById(pool, order.id);
    expect(sentOrder?.status).toBe('sent');
    const detectedAt = new Date().toISOString();
    const returnEvents = [
      {
        label: 'Colis non réclamé - retour à l’expéditeur',
        dateTime: detectedAt,
        location: 'Paris',
        countryCode: 'FR',
      },
    ];
    const detected = await applyCarrierReturnSignal(pool, sentOrder!, returnEvents, 'RETURN');
    expect(detected?.returnReview).toBe(1);
    expect(detected?.order.status).toBe('return_review');

    const summary = await findAdminOrder(request, admin.accessToken, 'return_review', order.id);
    expect(summary?.id).toBe(order.id);

    const { body: detail } = await apiJson<{
      order?: {
        status?: string;
        returnReview?: {
          returnType?: string;
          detectionSource?: string;
          stockLedgerComplete?: boolean;
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
    }>(request, 'GET', `/admin/orders/${order.id}`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(detail.order?.status).toBe('return_review');
    expect(detail.order?.returnReview?.returnType).toBe('unclaimed');
    expect(detail.order?.returnReview?.detectionSource).toBe('carrier');
    expect(detail.order?.returnReview?.stockLedgerComplete).toBe(true);
    expect(detail.order?.returnReview?.stockLines?.length).toBeGreaterThan(0);

    const { body: dismissed } = await apiJson<{ order?: { status?: string } }>(
      request,
      'POST',
      `/admin/orders/${order.id}/return-review/dismiss`,
      {
        token: admin.accessToken,
        data: { reason: 'Verify false-signal suppression', confirmed: true },
        expectedStatus: 200,
      },
    );
    expect(dismissed.order?.status).toBe('sent');
    const restoredSentOrder = await getById(pool, order.id);
    const suppressed = await applyCarrierReturnSignal(pool, restoredSentOrder!, returnEvents, 'RETURN');
    expect(suppressed?.returnReview).toBe(0);
    expect(suppressed?.order.status).toBe('sent');

    const laterEvidence = await applyCarrierReturnSignal(
      pool,
      suppressed!.order,
      [{ ...returnEvents[0]!, dateTime: new Date(Date.parse(detectedAt) + 1_000).toISOString() }],
      'RETURN',
    );
    expect(laterEvidence?.returnReview).toBe(1);
    expect(laterEvidence?.order.status).toBe('return_review');

    const { body: previewBody } = await apiJson<{
      preview?: {
        totalPaidCents: number;
        remainingRefundableCents: number;
        courierDefaultCents: number;
      };
    }>(request, 'GET', `/admin/orders/${order.id}/return-review/financial-preview`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(previewBody.preview?.totalPaidCents).toBe(0);
    expect(previewBody.preview?.remainingRefundableCents).toBe(0);

    await apiJson(request, 'POST', `/admin/orders/${order.id}/return-review/resolve`, {
      token: admin.accessToken,
      data: {
        refundMode: 'none',
        courierRetainedCents: previewBody.preview?.courierDefaultCents ?? 0,
        decisionReason: 'Functional test malformed stock row',
        stock: [null],
        confirmed: true,
      },
      expectedStatus: 400,
    });

    const stock = (detail.order?.returnReview?.stockLines ?? []).map((line) => ({
      productUid: line.productUid,
      shapeKey: line.shapeKey,
      lengthKey: line.lengthKey,
      size: line.size,
      quantity: line.productAvailable ? (line.maxRestockUnits ?? 0) : 0,
    }));
    const resolution = {
      refundMode: 'none',
      courierRetainedCents: previewBody.preview?.courierDefaultCents ?? 0,
      decisionReason: 'Parcel confirmed returned after manual review',
      stock,
      confirmed: true,
    } as const;
    const { body: resolved } = await apiJson<{
      changed?: boolean;
      order?: {
        status?: string;
        adminVerified?: boolean;
        returnReview?: { resolutionState?: string; refundAmountCents?: number; emailStatus?: string };
      };
    }>(request, 'POST', `/admin/orders/${order.id}/return-review/resolve`, {
      token: admin.accessToken,
      data: resolution,
      expectedStatus: 200,
    });
    expect(resolved.changed).toBe(true);
    expect(resolved.order?.status).toBe('cancelled');
    expect(resolved.order?.adminVerified).toBe(true);
    expect(resolved.order?.returnReview?.resolutionState).toBe('resolved');
    expect(resolved.order?.returnReview?.refundAmountCents).toBe(0);
    expect(resolved.order?.returnReview?.emailStatus).toBe('sent');

    const { body: repeated } = await apiJson<{ changed?: boolean }>(
      request,
      'POST',
      `/admin/orders/${order.id}/return-review/resolve`,
      { token: admin.accessToken, data: resolution, expectedStatus: 200 },
    );
    expect(repeated.changed).toBe(false);

    const restored = await pool.query<{ shipped_quantity: number; restocked_quantity: number }>(
      `select shipped_quantity, restocked_quantity
         from order_fulfillment_stock
        where order_id = $1`,
      [order.id],
    );
    expect(restored.rows.length).toBeGreaterThan(0);
    for (const line of restored.rows) expect(line.restocked_quantity).toBe(line.shipped_quantity);
  });

  test('order queue: it pages by status and opens one order in full', async ({ request }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);
    const { order } = await placeFreeOrder(request, customer.accessToken, { voucherCode });

    // The dashboard never lists everything at once: a status is required.
    await apiJson(request, 'GET', '/admin/orders', { token: admin.accessToken, expectedStatus: 400 });
    await apiJson(request, 'GET', '/admin/orders?status=nope', {
      token: admin.accessToken,
      expectedStatus: 400,
    });
    // The verified filter only means something on a terminal status.
    await apiJson(request, 'GET', '/admin/orders?status=confirmed&verified=true', {
      token: admin.accessToken,
      expectedStatus: 400,
    });
    await apiJson(request, 'GET', '/admin/orders?status=received&verified=maybe', {
      token: admin.accessToken,
      expectedStatus: 400,
    });

    const { body: page } = await apiJson<{ orders?: AdminOrderSummary[]; pagination?: Pagination }>(
      request,
      'GET',
      '/admin/orders?status=confirmed',
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(page.pagination?.page).toBe(1);
    expect(page.pagination?.pageSize).toBe(15);
    expect(page.pagination?.total).toBeGreaterThanOrEqual(1);

    const summary = await findAdminOrder(request, admin.accessToken, 'confirmed', order.id);
    expect(summary).toBeTruthy();
    expect(summary?.orderNumber).toBe(order.orderNumber);
    expect(summary?.userEmail).toBe(customer.email);
    // Gift lines never inflate the fulfilment count.
    expect(summary?.itemCount).toBe(1);
    expect(summary?.adminVerified).toBe(false);

    const { body: detail } = await apiJson<{
      order?: {
        id: string;
        orderNumber: string;
        userEmail?: string | null;
        adminVerified?: boolean;
        adminVerifiedAt?: string | null;
        items?: Array<{ origin: string }>;
        line1?: string;
        courierCode?: string | null;
      };
    }>(request, 'GET', `/admin/orders/${order.id}`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(detail.order?.orderNumber).toBe(order.orderNumber);
    expect(detail.order?.adminVerified).toBe(false);
    expect(detail.order?.adminVerifiedAt).toBeNull();
    expect(detail.order?.line1).toBeTruthy();
    expect(detail.order?.items?.[0]?.origin).toBe('user');

    await apiJson(request, 'GET', '/admin/orders/00000000-0000-4000-8000-000000000000', {
      token: admin.accessToken,
      expectedStatus: 404,
    });

    // Only a terminal order can be acknowledged.
    const { body: tooEarly } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      `/admin/orders/${order.id}/verify`,
      { token: admin.accessToken, expectedStatus: 409 },
    );
    expect(tooEarly.error?.code).toBe('invalid_status');

    // Unknown / terminal statuses are rejected as bad input. `sent` is a
    // real transition but only from `to_send` — from `confirmed` it is a
    // conflict, not a malformed body.
    for (const status of ['confirmed', 'received', 'cancelled']) {
      await apiJson(request, 'PATCH', `/admin/orders/${order.id}/status`, {
        token: admin.accessToken,
        data: { status },
        expectedStatus: 400,
      });
    }
    const { body: sentTooEarly } = await apiJson<{ error?: { code?: string } }>(
      request,
      'PATCH',
      `/admin/orders/${order.id}/status`,
      {
        token: admin.accessToken,
        data: { status: 'sent' },
        expectedStatus: 409,
      },
    );
    expect(sentTooEarly.error?.code).toBe('invalid_transition');
    await apiJson(request, 'PATCH', `/admin/orders/${order.id}/status`, {
      token: admin.accessToken,
      data: { status: 'to_send', noPayment: true },
      expectedStatus: 400,
    });

    const { body: prepared } = await apiJson<{ order?: { status?: string } }>(
      request,
      'PATCH',
      `/admin/orders/${order.id}/status`,
      { token: admin.accessToken, data: { status: 'in_preparation', noPayment: true }, expectedStatus: 200 },
    );
    expect(prepared.order?.status).toBe('in_preparation');
    // Re-sending the status the order already has is idempotent — a double
    // click in the dashboard must not look like a failure.
    const { body: repeated } = await apiJson<{ order?: { status?: string } }>(
      request,
      'PATCH',
      `/admin/orders/${order.id}/status`,
      { token: admin.accessToken, data: { status: 'in_preparation', noPayment: true }, expectedStatus: 200 },
    );
    expect(repeated.order?.status).toBe('in_preparation');

    // No carrier shipment was ever generated for this order.
    const sticker = await request.get(`/admin/orders/${order.id}/sticker`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    expect(sticker.status()).toBe(404);
    const { status: trackingStatus } = await apiJson(request, 'GET', `/admin/orders/${order.id}/tracking`, {
      token: admin.accessToken,
      expectedStatus: [404, 409],
    });
    expect([404, 409]).toContain(trackingStatus);
  });

  test('a terminal order: is acknowledged exactly once', async ({ request }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);
    const { order } = await placeFreeOrder(request, customer.accessToken, { voucherCode });
    await apiJson(request, 'DELETE', `/account/orders/${order.id}`, {
      token: customer.accessToken,
      expectedStatus: 200,
    });

    const { body: unverified } = await apiJson<{ orders?: AdminOrderSummary[] }>(
      request,
      'GET',
      '/admin/orders?status=cancelled&verified=false',
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect((unverified.orders ?? []).some((entry) => entry.id === order.id)).toBe(true);

    const { body: verified } = await apiJson<{
      order?: { adminVerified?: boolean; adminVerifiedAt?: string | null };
    }>(request, 'POST', `/admin/orders/${order.id}/verify`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(verified.order?.adminVerified).toBe(true);
    expect(verified.order?.adminVerifiedAt).toBeTruthy();

    // There is no undo, and no second acknowledgement.
    const { body: again } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      `/admin/orders/${order.id}/verify`,
      { token: admin.accessToken, expectedStatus: 409 },
    );
    expect(again.error?.code).toBe('already_verified');

    const { body: filtered } = await apiJson<{ orders?: AdminOrderSummary[] }>(
      request,
      'GET',
      '/admin/orders?status=cancelled&verified=false',
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect((filtered.orders ?? []).some((entry) => entry.id === order.id)).toBe(false);

    await apiJson(request, 'POST', '/admin/orders/00000000-0000-4000-8000-000000000000/verify', {
      token: admin.accessToken,
      expectedStatus: 404,
    });
  });

  test('runtime operator: toggles round-trip through app preferences', async ({ request }) => {
    const admin = await registerAdmin(request);

    const { body: before } = await apiJson<{
      preferences?: {
        apiLogEnabled: boolean;
        apiLogEnabledEffective: boolean;
        contactEmailGuestEnabled: boolean;
        cronShipmentLogEnabled: boolean;
        spy?: Record<string, boolean>;
        updatedAt?: string;
      };
    }>(request, 'GET', '/admin/preferences', { token: admin.accessToken, expectedStatus: 200 });
    const initial = before.preferences!;
    expect(typeof initial.apiLogEnabled).toBe('boolean');
    expect(typeof initial.apiLogEnabledEffective).toBe('boolean');
    expect(typeof (initial as { paymentCardEnabled?: boolean }).paymentCardEnabled).toBe('boolean');
    expect(initial.spy?.order_confirmation !== undefined).toBe(true);

    await apiJson(request, 'PATCH', '/admin/preferences', {
      token: admin.accessToken,
      data: { apiLogEnabled: 'yes' },
      expectedStatus: 400,
    });

    const { body: patched } = await apiJson<{
      preferences?: { cronShipmentLogEnabled: boolean; spy?: Record<string, boolean> };
    }>(request, 'PATCH', '/admin/preferences', {
      token: admin.accessToken,
      data: {
        cronShipmentLogEnabled: !initial.cronShipmentLogEnabled,
        spy: { order_confirmation: !initial.spy!.order_confirmation },
      },
      expectedStatus: 200,
    });
    expect(patched.preferences?.cronShipmentLogEnabled).toBe(!initial.cronShipmentLogEnabled);
    expect(patched.preferences?.spy?.order_confirmation).toBe(!initial.spy!.order_confirmation);

    // A partial spy map only touches the keys it names.
    for (const [kind, value] of Object.entries(initial.spy ?? {})) {
      if (kind === 'order_confirmation') continue;
      expect(patched.preferences?.spy?.[kind]).toBe(value);
    }

    // These toggles are shop-wide runtime state, so put them back.
    const { body: restored } = await apiJson<{
      preferences?: { cronShipmentLogEnabled: boolean; spy?: Record<string, boolean> };
    }>(request, 'PATCH', '/admin/preferences', {
      token: admin.accessToken,
      data: {
        cronShipmentLogEnabled: initial.cronShipmentLogEnabled,
        spy: { order_confirmation: initial.spy!.order_confirmation },
      },
      expectedStatus: 200,
    });
    expect(restored.preferences?.cronShipmentLogEnabled).toBe(initial.cronShipmentLogEnabled);
    expect(restored.preferences?.spy?.order_confirmation).toBe(initial.spy!.order_confirmation);
  });
});
