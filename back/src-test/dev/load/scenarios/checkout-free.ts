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
import { pickFromPool, type LoadSetupData } from '../_lib/types.ts';

/** Cart → selection → voucher validate → /checkout/free (no Stripe). */
export function checkoutFree(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const user = pickFromPool(data.checkoutUsers);
  const catalog = user.catalog ?? data.catalog;
  const voucherCode = user.voucherCode ?? data.voucherCode;

  const loggedIn = login(baseUrl, user.email);
  const token = accessTokenFrom(loggedIn.body) || user.accessToken;
  const addressId = user.addressId;
  check(addressId, { checkout_address: (value) => Boolean(value) });
  check(voucherCode, { checkout_voucher: (value) => Boolean(value) });
  if (!addressId || !voucherCode || !catalog.courierCode) return;

  const added = postJson(
    baseUrl,
    '/account/cart',
    'checkout_cart_add',
    {
      productId: catalog.productId,
      shapeKey: catalog.shapeKey,
      lengthKey: catalog.lengthKey,
      size: catalog.size,
      quantity: 1,
    },
    { status: 200, body: successEnvelope },
    token,
  );
  if (!added.ok) return;

  putJson(
    baseUrl,
    '/account/checkout/selection',
    'checkout_selection_put',
    {
      addressId,
      courierCode: catalog.courierCode,
      express: false,
      sameAsBilling: true,
    },
    { status: 200, body: successEnvelope },
    token,
  );
  getJson(baseUrl, '/account/checkout/selection', 'checkout_selection_get', successEnvelope, token);

  const checkoutSessionToken = startCheckoutSession(baseUrl, token);
  check(checkoutSessionToken, { checkout_session_start: (value) => Boolean(value) });
  if (!checkoutSessionToken) return;
  const sessionHeaders = { [CHECKOUT_SESSION_HEADER]: checkoutSessionToken };

  const validated = postJson(
    baseUrl,
    '/account/checkout/voucher/validate',
    'checkout_voucher_validate',
    {
      addressId,
      courierCode: catalog.courierCode,
      express: false,
      code: voucherCode,
    },
    {
      status: 200,
      body: (body) => successEnvelope(body) && Number((body as { total?: number }).total) === 0,
    },
    token,
    sessionHeaders,
  );
  if (!validated.ok) return;

  const free = postJson(
    baseUrl,
    '/account/checkout/free',
    'checkout_free',
    {
      addressId,
      courierCode: catalog.courierCode,
      express: false,
      voucherCode,
    },
    {
      status: 201,
      body: (body) => successEnvelope(body) && Boolean((body as { order?: { id?: string } }).order?.id),
    },
    token,
    sessionHeaders,
  );

  if (free.ok) {
    const orderId = (free.body as { order?: { id?: string } } | null)?.order?.id;
    if (orderId) {
      getJson(
        baseUrl,
        `/account/orders/${encodeURIComponent(orderId)}`,
        'checkout_order_detail',
        successEnvelope,
        token,
      );
    }
    getJson(baseUrl, '/account/orders', 'checkout_orders_list', successEnvelope, token);
  }
}
