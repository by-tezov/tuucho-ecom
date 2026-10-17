import http from 'k6/http';
import { check } from 'k6';
import { accessTokenFrom, login } from '../_lib/auth.ts';
import {
  apiBaseUrl,
  CHECKOUT_SESSION_HEADER,
  getJson,
  postJson,
  putJson,
  startCheckoutSession,
  successEnvelope,
} from '../_lib/http.ts';
import { pickFromPool, type LoadSetupData, type NailPick } from '../_lib/types.ts';

const FINGERS = ['left-thumb', 'left-index', 'right-thumb'] as const;

export function compositionBody(nail: NailPick, quantity: number) {
  return {
    size: nail.size,
    quantity,
    nails: FINGERS.map((finger) => ({
      productId: nail.productId,
      shapeKey: nail.shapeKey,
      lengthKey: nail.lengthKey,
      variationKey: nail.variationKey,
      finger,
    })),
  };
}

/** Compose a set, change it, look at the cart, pay it with the VU's own
 * voucher, then open the order and download its invoice. */
export function compose(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const user = pickFromPool(data.composeUsers);
  const nail = data.nails[(__VU + __ITER) % Math.max(data.nails.length, 1)];
  check(nail, { compose_nail_available: (value) => Boolean(value) });
  if (!nail || !user.addressId || !user.voucherCode || !data.catalog.courierCode) return;

  const token = accessTokenFrom(login(baseUrl, user.email).body) || user.accessToken;

  const created = postJson(
    baseUrl,
    '/account/cart/compositions',
    'compose_create',
    compositionBody(nail, 1),
    {
      status: 201,
      body: (body) => Boolean((body as { composition?: { id?: string } }).composition?.id),
    },
    token,
  );
  const compositionId = (created.body as { composition?: { id?: string } } | null)?.composition?.id;
  if (!compositionId) return;
  putJson(
    baseUrl,
    `/account/cart/compositions/${encodeURIComponent(compositionId)}`,
    'compose_update',
    compositionBody(nail, 2),
    { status: 200, body: successEnvelope },
    token,
  );
  getJson(baseUrl, '/account/cart', 'compose_cart_get', successEnvelope, token);

  const session = startCheckoutSession(baseUrl, token);
  check(session, { compose_session_start: (value) => Boolean(value) });
  if (!session) return;
  const paid = postJson(
    baseUrl,
    '/account/checkout/free',
    'compose_checkout_free',
    {
      addressId: user.addressId,
      courierCode: data.catalog.courierCode,
      express: false,
      voucherCode: user.voucherCode,
    },
    {
      status: 201,
      body: (body) => Boolean((body as { order?: { id?: string } }).order?.id),
    },
    token,
    { [CHECKOUT_SESSION_HEADER]: session },
  );
  const orderId = (paid.body as { order?: { id?: string } } | null)?.order?.id;
  if (!orderId) return;
  getJson(
    baseUrl,
    `/account/orders/${encodeURIComponent(orderId)}`,
    'compose_order_detail',
    successEnvelope,
    token,
  );
  const invoice = http.get(`${baseUrl}/account/orders/${encodeURIComponent(orderId)}/invoice`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'order_invoice', phase: 'vu' },
  });
  check(invoice, {
    'order_invoice status 200': (r) => r.status === 200,
    'order_invoice pdf': (r) => String(r.headers['Content-Type'] ?? '').includes('application/pdf'),
  });
}
