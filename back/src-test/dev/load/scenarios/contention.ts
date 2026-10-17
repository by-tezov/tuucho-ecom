import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { accessTokenFrom, login } from '../_lib/auth.ts';
import {
  apiBaseUrl,
  CHECKOUT_SESSION_HEADER,
  deleteJson,
  getJson,
  postJson,
  startCheckoutSession,
  successEnvelope,
} from '../_lib/http.ts';
import { pickFromPool, pickTwinFromPool, type CatalogPick, type LoadSetupData } from '../_lib/types.ts';
import { compositionBody } from './compose.ts';

/** Orders won and refusals received on the scarce variant or voucher. The
 * orchestrator's post-run checks compare them with the database: every win
 * must be backed by stock and by a voucher use, never more. */
const scarceOrders = new Counter('scarce_orders');
const scarceRefused = new Counter('scarce_refused');

/** Losing a race is a refusal, not a failure. */
const RACE_STATUSES = [201, 400, 409];

function cartLinePath(pick: CatalogPick): string {
  return `/account/cart/${[pick.productId, pick.shapeKey, pick.lengthKey, pick.size]
    .map(encodeURIComponent)
    .join('/')}`;
}

/** Every scarce VU buys the same low-stock variant; every other iteration
 * also spends the one voucher with a small quantity. */
export function scarceCheckout(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const user = pickFromPool(data.checkoutUsers);
  const pick = data.scarceCatalog;
  const voucherCode = __ITER % 2 === 0 && data.scarceVoucherCode ? data.scarceVoucherCode : user.voucherCode;
  if (!pick || !user.addressId || !voucherCode) return;

  const token = accessTokenFrom(login(baseUrl, user.email).body) || user.accessToken;
  postJson(
    baseUrl,
    '/account/cart',
    'scarce_cart_add',
    {
      productId: pick.productId,
      shapeKey: pick.shapeKey,
      lengthKey: pick.lengthKey,
      size: pick.size,
      quantity: 1,
    },
    { status: 200, body: successEnvelope },
    token,
  );
  const session = startCheckoutSession(baseUrl, token);
  if (!session) return;
  const paid = postJson(
    baseUrl,
    '/account/checkout/free',
    'scarce_checkout_free',
    { addressId: user.addressId, courierCode: pick.courierCode, express: false, voucherCode },
    { status: RACE_STATUSES },
    token,
    { [CHECKOUT_SESSION_HEADER]: session },
  );
  if (paid.status === 201) {
    scarceOrders.add(1);
    return;
  }
  scarceRefused.add(1, {
    code: String((paid.body as { error?: { code?: string } } | null)?.error?.code ?? ''),
  });
  // A refused line stays in the cart; drop it so the next iteration buys one
  // unit again rather than an ever-growing quantity.
  deleteJson(baseUrl, cartLinePath(pick), 'scarce_cart_remove', { status: [200, 404] }, token);
}

/** Two VUs, one account, two sessions: both shop the same cart, and both try
 * to pay it. Every refusal is acceptable (the other twin may have just paid
 * or emptied it); a 5xx is not. */
export function twinCart(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const user = pickTwinFromPool(data.twinUsers);
  const pick = data.catalogs[(__VU + __ITER) % data.catalogs.length];
  if (!pick || !user.addressId || !user.voucherCode) return;

  const token = accessTokenFrom(login(baseUrl, user.email).body) || user.accessToken;
  postJson(
    baseUrl,
    '/account/cart',
    'twin_cart_add',
    {
      productId: pick.productId,
      shapeKey: pick.shapeKey,
      lengthKey: pick.lengthKey,
      size: pick.size,
      quantity: 1,
    },
    { status: 200, body: successEnvelope },
    token,
  );
  const nail = data.nails[(__VU + __ITER) % Math.max(data.nails.length, 1)];
  if (nail) {
    postJson(
      baseUrl,
      '/account/cart/compositions',
      'twin_compose_create',
      compositionBody(nail, 1),
      {
        status: [201, 409],
      },
      token,
    );
  }
  getJson(baseUrl, '/account/cart', 'twin_cart_get', successEnvelope, token);
  getJson(baseUrl, '/account/carts', 'twin_carts_list', successEnvelope, token);
  const session = startCheckoutSession(baseUrl, token);
  check(session, { twin_session_start: (value) => Boolean(value) });
  if (!session) return;
  postJson(
    baseUrl,
    '/account/checkout/free',
    'twin_checkout_free',
    {
      addressId: user.addressId,
      courierCode: pick.courierCode,
      express: false,
      voucherCode: user.voucherCode,
    },
    { status: RACE_STATUSES },
    token,
    { [CHECKOUT_SESSION_HEADER]: session },
  );
}
