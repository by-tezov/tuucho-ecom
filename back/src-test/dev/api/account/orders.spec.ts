import { test, expect } from 'patchright/test';
import {
  apiJson,
  createAddress,
  createZeroingVoucher,
  placeFreeOrder,
  registerUser,
  type PlacedOrder,
} from '../../support/api.js';

/** The seeded `gift_per_nail_set` rule rides along on every nail set, so an
 * order always carries its own free `origin: "rule"` line next to what the
 * customer actually chose. */
function userItems<T extends { origin?: string }>(items: T[] | undefined): T[] {
  return (items ?? []).filter((item) => item.origin === 'user');
}

type OrderBody = {
  order?: PlacedOrder & {
    trackingAvailable?: boolean;
    revisionCount?: number;
    billingLine1?: string;
    line1?: string;
    paymentCaptureStatus?: string;
    paymentMethod?: { type?: string };
    voucherCode?: string | null;
  };
  changed?: boolean;
};
type LockBody = {
  lock?: { lockToken?: string; lockUntil?: string; ttlSeconds?: number };
  error?: { code?: string };
};

/** Every order below is confirmed through `POST /account/checkout/free`: a
 * voucher large enough to zero the cart lets the whole post-purchase surface
 * be tested without a Stripe payment. */
test.describe('API orders', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('orders');
  });

  test('a confirmed order: is listed, detailed and self-cancellable', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { order } = await placeFreeOrder(request, accessToken, { voucherCode, quantity: 2 });
    expect(order.status).toBe('confirmed');
    expect(order.total).toBe(0);
    expect(order.orderNumber).toMatch(/^CMD-\d{6}$/);

    const { body: active } = await apiJson<{ orders?: OrderBody['order'][] }>(
      request,
      'GET',
      '/account/orders',
      { token: accessToken, expectedStatus: 200 },
    );
    const listed = (active.orders ?? []).find((entry) => entry?.id === order.id);
    expect(listed).toBeTruthy();
    // Tracking availability is a live courier lookup, not a confirm-time
    // snapshot, so the list always carries the flag.
    expect(typeof listed?.trackingAvailable).toBe('boolean');
    expect(listed?.revisionCount).toBe(0);

    const { body: history } = await apiJson<{ orders?: OrderBody['order'][] }>(
      request,
      'GET',
      '/account/orders?scope=history',
      { token: accessToken, expectedStatus: 200 },
    );
    expect((history.orders ?? []).some((entry) => entry?.id === order.id)).toBe(false);

    const { body: detail } = await apiJson<OrderBody>(request, 'GET', `/account/orders/${order.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(detail.order?.orderNumber).toBe(order.orderNumber);
    expect(detail.order?.paymentCaptureStatus).toBe('not_required');
    expect(detail.order?.paymentMethod?.type).toBe('free');
    expect(detail.order?.voucherCode).toBe(voucherCode);
    const purchased = userItems(detail.order?.items);
    expect(purchased).toHaveLength(1);
    expect(purchased[0]?.quantity).toBe(2);
    // The rule's gift is frozen onto the order too, locked and free.
    const gift = (detail.order?.items ?? []).find((item) => item.origin === 'rule');
    expect(gift?.locked).toBe(true);
    expect(gift?.lineTotal).toBe(0);
    expect(gift?.ruleCode).toBeTruthy();
    expect(detail.order?.integrityToken).toBeTruthy();

    const { body: noRevisions } = await apiJson<{ revisions?: unknown[] }>(
      request,
      'GET',
      `/account/orders/${order.id}/revisions`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(noRevisions.revisions).toEqual([]);

    // Never shipped, so there is nothing to trace — but the failure has to
    // be one of the two documented outcomes, not a crash.
    const { status: trackingStatus, body: tracking } = await apiJson<{ error?: { code?: string } }>(
      request,
      'GET',
      `/account/orders/${order.id}/tracking`,
      { token: accessToken, expectedStatus: [404, 409] },
    );
    expect(tracking.error?.code).toBe(
      trackingStatus === 404 ? 'shipment_not_found' : 'tracking_unavailable',
    );

    // Ownership is checked on every order route.
    const intruder = await registerUser(request);
    for (const path of ['', '/revisions', '/tracking']) {
      await apiJson(request, 'GET', `/account/orders/${order.id}${path}`, {
        token: intruder.accessToken,
        expectedStatus: 404,
      });
    }

    const { body: cancelled } = await apiJson<OrderBody>(
      request,
      'DELETE',
      `/account/orders/${order.id}`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(cancelled.order?.status).toBe('cancelled');

    const { body: afterCancel } = await apiJson<{ orders?: OrderBody['order'][] }>(
      request,
      'GET',
      '/account/orders?scope=history',
      { token: accessToken, expectedStatus: 200 },
    );
    expect((afterCancel.orders ?? []).some((entry) => entry?.id === order.id)).toBe(true);

    // Cancelling twice is refused rather than silently repeated.
    const { body: again } = await apiJson<{ error?: { code?: string } }>(
      request,
      'DELETE',
      `/account/orders/${order.id}`,
      { token: accessToken, expectedStatus: 409 },
    );
    expect(again.error?.code).toBe('order_not_cancellable');
  });

  test('address amendments run under a revision: lock and are journalled', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { order } = await placeFreeOrder(request, accessToken, { voucherCode });

    const { body: locked } = await apiJson<LockBody & OrderBody>(
      request,
      'POST',
      `/account/orders/${order.id}/revisions/lock`,
      { token: accessToken, expectedStatus: 200 },
    );
    const lockToken = locked.lock?.lockToken;
    expect(lockToken).toBeTruthy();
    expect(locked.lock?.ttlSeconds).toBeGreaterThan(0);
    expect(Date.parse(locked.lock!.lockUntil!)).toBeGreaterThan(Date.now());
    expect(locked.order?.id).toBe(order.id);

    // Re-acquiring is a refresh for the same customer, not a conflict.
    const { body: refreshed } = await apiJson<LockBody>(
      request,
      'POST',
      `/account/orders/${order.id}/revisions/lock`,
      { token: accessToken, expectedStatus: 200 },
    );
    const activeToken = refreshed.lock?.lockToken;
    expect(activeToken).toBeTruthy();

    const { body: badExtend } = await apiJson<LockBody>(
      request,
      'POST',
      `/account/orders/${order.id}/revisions/lock/extend`,
      { token: accessToken, data: { lockToken: 'not-the-lock' }, expectedStatus: 409 },
    );
    expect(badExtend.error?.code).toBe('lock_invalid');
    await apiJson(request, 'POST', `/account/orders/${order.id}/revisions/lock/extend`, {
      token: accessToken,
      data: {},
      expectedStatus: 400,
    });
    const { body: extended } = await apiJson<LockBody>(
      request,
      'POST',
      `/account/orders/${order.id}/revisions/lock/extend`,
      { token: accessToken, data: { lockToken: activeToken }, expectedStatus: 200 },
    );
    expect(extended.lock?.lockToken).toBeTruthy();
    const extendedToken = extended.lock!.lockToken!;

    const billing = await createAddress(request, accessToken, {
      kind: 'facturation',
      label: 'Facturation E2E',
      line1: '5 rue de la Facture',
    });
    await apiJson(request, 'PATCH', `/account/orders/${order.id}/billing`, {
      token: accessToken,
      data: { sameAsShipping: false, billingAddressId: billing.id },
      expectedStatus: 400,
    });
    await apiJson(request, 'PATCH', `/account/orders/${order.id}/billing`, {
      token: accessToken,
      data: { lockToken: extendedToken, sameAsShipping: false },
      expectedStatus: 400,
    });

    const { body: amended } = await apiJson<OrderBody>(
      request,
      'PATCH',
      `/account/orders/${order.id}/billing`,
      {
        token: accessToken,
        data: { lockToken: extendedToken, sameAsShipping: false, billingAddressId: billing.id },
        expectedStatus: 200,
      },
    );
    expect(amended.changed).toBe(true);
    expect(amended.order?.billingSameAsShipping).toBe(false);
    expect(amended.order?.billingLine1).toBe('5 rue de la Facture');
    expect(amended.order?.revisionCount).toBe(1);
    // The chained fingerprint moves with the amendment.
    expect(amended.order?.integrityToken).toBeTruthy();
    expect(amended.order?.integrityToken).not.toBe(order.integrityToken);

    // Saving consumes the lock, so the same token cannot amend twice.
    await apiJson(request, 'PATCH', `/account/orders/${order.id}/billing`, {
      token: accessToken,
      data: { lockToken: extendedToken, sameAsShipping: true },
      expectedStatus: 409,
    });

    const { body: journal } = await apiJson<{
      revisions?: Array<{
        revisionNumber: number;
        kind: string;
        requestedBy: string;
        integrityToken: string;
        createdAt: string;
      }>;
    }>(request, 'GET', `/account/orders/${order.id}/revisions`, {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(journal.revisions).toHaveLength(1);
    expect(journal.revisions?.[0]?.revisionNumber).toBe(1);
    expect(journal.revisions?.[0]?.kind).toBe('billing_address_change');
    expect(journal.revisions?.[0]?.integrityToken).toBeTruthy();
    expect(journal.revisions?.[0]?.createdAt).toBeTruthy();

    // A delivery amendment must keep courier, country and network, so a
    // second French home address is accepted.
    const { body: relocked } = await apiJson<LockBody>(
      request,
      'POST',
      `/account/orders/${order.id}/revisions/lock`,
      { token: accessToken, expectedStatus: 200 },
    );
    const shippingLock = relocked.lock!.lockToken!;
    const moved = await createAddress(request, accessToken, {
      label: 'Nouvelle adresse',
      line1: '77 avenue de Test',
    });
    const { body: reshipped } = await apiJson<OrderBody>(
      request,
      'PATCH',
      `/account/orders/${order.id}/shipping`,
      { token: accessToken, data: { lockToken: shippingLock, addressId: moved.id }, expectedStatus: 200 },
    );
    expect(reshipped.changed).toBe(true);
    expect(reshipped.order?.line1).toBe('77 avenue de Test');
    expect(reshipped.order?.revisionCount).toBe(2);

    // Releasing an unused lock is the "cancel without saving" path.
    const { body: lastLock } = await apiJson<LockBody>(
      request,
      'POST',
      `/account/orders/${order.id}/revisions/lock`,
      { token: accessToken, expectedStatus: 200 },
    );
    await apiJson(request, 'DELETE', `/account/orders/${order.id}/revisions/lock`, {
      token: accessToken,
      data: {},
      expectedStatus: 400,
    });
    await apiJson(request, 'DELETE', `/account/orders/${order.id}/revisions/lock`, {
      token: accessToken,
      data: { lockToken: lastLock.lock!.lockToken },
      expectedStatus: 200,
    });
    const { body: releasedTwice } = await apiJson<LockBody>(
      request,
      'DELETE',
      `/account/orders/${order.id}/revisions/lock`,
      { token: accessToken, data: { lockToken: lastLock.lock!.lockToken }, expectedStatus: 409 },
    );
    expect(releasedTwice.error?.code).toBe('lock_invalid');
  });

  test('the invoice: is generated once, e-mailable, and freezes the order', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { order } = await placeFreeOrder(request, accessToken, { voucherCode });

    const download = await request.get(`/account/orders/${order.id}/invoice`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toContain('application/pdf');
    const disposition = download.headers()['content-disposition'] ?? '';
    expect(disposition).toMatch(/attachment; filename="FACT-\d+\.pdf"/);
    const bytes = await download.body();
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');

    // Clicking again never mints a second document or invoice number.
    const second = await request.get(`/account/orders/${order.id}/invoice`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(second.status()).toBe(200);
    expect(second.headers()['content-disposition']).toBe(disposition);

    await apiJson(request, 'POST', `/account/orders/${order.id}/invoice/email`, {
      token: accessToken,
      expectedStatus: 200,
    });

    // Once an invoice exists the order is a legal document: no amendment…
    const { body: locked } = await apiJson<LockBody>(
      request,
      'POST',
      `/account/orders/${order.id}/revisions/lock`,
      { token: accessToken, expectedStatus: 409 },
    );
    expect(locked.error?.code).toBe('invoice_already_issued');

    // …and no self-cancellation.
    const { body: cancel } = await apiJson<{ error?: { code?: string } }>(
      request,
      'DELETE',
      `/account/orders/${order.id}`,
      { token: accessToken, expectedStatus: 409 },
    );
    expect(cancel.error?.code).toBe('invoice_already_issued');

    const intruder = await registerUser(request);
    const forbidden = await request.get(`/account/orders/${order.id}/invoice`, {
      headers: { Authorization: `Bearer ${intruder.accessToken}` },
    });
    expect(forbidden.status()).toBe(404);
    await apiJson(request, 'POST', `/account/orders/${order.id}/invoice/email`, {
      token: intruder.accessToken,
      expectedStatus: 404,
    });
  });

  test('rebuy: rebuilds a cart from a finished order and can be undone', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { order, variant } = await placeFreeOrder(request, accessToken, { voucherCode, quantity: 2 });

    // Only a finished order can be re-bought.
    const { body: tooEarly } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/carts/rebuy',
      { token: accessToken, data: { orderId: order.id, mode: 'new' }, expectedStatus: 400 },
    );
    expect(tooEarly.error?.code).toBe('invalid_request');

    await apiJson(request, 'DELETE', `/account/orders/${order.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });

    await apiJson(request, 'POST', '/account/carts/rebuy', {
      token: accessToken,
      data: { orderId: order.id, mode: 'merge' },
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', '/account/carts/rebuy', {
      token: accessToken,
      data: { orderId: '00000000-0000-4000-8000-000000000000', mode: 'new' },
      expectedStatus: 404,
    });

    const { body: rebought } = await apiJson<{
      cartId?: string;
      snapshotToken?: string;
      items?: Array<{ productId: string; quantity: number }>;
    }>(request, 'POST', '/account/carts/rebuy', {
      token: accessToken,
      data: { orderId: order.id, mode: 'new' },
      expectedStatus: 200,
    });
    expect(rebought.cartId).toBeTruthy();
    expect(rebought.snapshotToken).toBeTruthy();
    const rebuyLine = (rebought.items ?? []).find((line) => line.productId === variant.productId);
    expect(rebuyLine?.quantity).toBe(2);

    const { body: carts } = await apiJson<{ carts?: Array<{ id: string; isActive: boolean }> }>(
      request,
      'GET',
      '/account/carts',
      { token: accessToken, expectedStatus: 200 },
    );
    const rebuyCart = (carts.carts ?? []).find((entry) => entry.id === rebought.cartId);
    expect(rebuyCart?.isActive).toBe(true);

    // Undo deletes the cart the rebuy created.
    await apiJson(request, 'POST', '/account/carts/rebuy/cancel', {
      token: accessToken,
      data: { snapshotToken: rebought.snapshotToken },
      expectedStatus: 200,
    });
    const { body: afterUndo } = await apiJson<{ carts?: Array<{ id: string }> }>(
      request,
      'GET',
      '/account/carts',
      { token: accessToken, expectedStatus: 200 },
    );
    expect((afterUndo.carts ?? []).some((entry) => entry.id === rebought.cartId)).toBe(false);

    // The snapshot token is one-shot.
    await apiJson(request, 'POST', '/account/carts/rebuy/cancel', {
      token: accessToken,
      data: { snapshotToken: rebought.snapshotToken },
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', '/account/carts/rebuy/cancel', {
      token: accessToken,
      data: {},
      expectedStatus: 400,
    });
  });

  test('guest-order: claim endpoints stay closed to an account with no matching order', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    const { body } = await apiJson<{ orders?: unknown[] }>(request, 'GET', '/account/guest-orders', {
      token: accessToken,
      expectedStatus: 200,
    });
    // Matching a guest order by email alone is never enough to see it.
    expect(body.orders).toEqual([]);

    const unknownId = '00000000-0000-4000-8000-000000000000';
    const { body: noToken } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      `/account/guest-orders/${unknownId}/claim`,
      { token: accessToken, data: {}, expectedStatus: 400 },
    );
    expect(noToken.error?.code).toBe('invalid_request');

    const { body: unknown } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      `/account/guest-orders/${unknownId}/claim`,
      { token: accessToken, data: { integrityToken: 'ABCD-1234-EFGH-5678' }, expectedStatus: 404 },
    );
    expect(unknown.error?.code).toBe('not_found');

    const { body: dismissed } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      `/account/guest-orders/${unknownId}/dismiss`,
      { token: accessToken, expectedStatus: 404 },
    );
    expect(dismissed.error?.code).toBe('not_found');
  });
});
