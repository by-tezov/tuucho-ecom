import type { APIRequestContext } from 'patchright/test';
import { pool } from '../../../src/db/pool.js';
import {
  apiJson,
  createAddress,
  registerUser,
  startCheckoutSession,
  testCourierCode,
  type PurchasableVariant,
} from './api.js';
import { E2E_LENGTH, E2E_SHAPES, type E2eProductUid } from './catalog.js';

/** A buyer who loses the last unit is refused one of two ways, depending on
 * when the winner commits: before pricing, the sold-out line is dropped and
 * the cart is `empty_cart` (400); between pricing and the stock lock, the
 * reservation itself fails with `size_unavailable` (409). */
export const SOLD_OUT_CODES = ['empty_cart', 'size_unavailable'];

/** One ready-to-pay account: address, checkout session, one cart line. */
export interface RaceBuyer {
  email: string;
  accessToken: string;
  addressId: string;
  checkoutSession: string;
}

/** The single stocked variant of a race seed (see E2E_PRODUCT_UIDS.RACE_*). */
export async function raceVariant(productUid: E2eProductUid): Promise<PurchasableVariant> {
  const { rows } = await pool.query<{ id: string }>(`select id from products where product_uid = $1`, [
    productUid,
  ]);
  if (!rows[0]) throw new Error(`missing E2E race product ${productUid}`);
  return { productId: rows[0].id, productUid, shapeKey: E2E_SHAPES[0], lengthKey: E2E_LENGTH, size: 'M' };
}

/** Units of one variant already taken by live holds and unshipped orders,
 * the same `allocated_quantity` reserveCart subtracts. */
export async function allocatedUnits(variant: PurchasableVariant): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `select coalesce(sum(sri.quantity), 0)::int as n
     from stock_reservation_items sri
     join stock_reservations sr on sr.id = sri.reservation_id
     where sri.product_id = $1 and sri.shape_key = $2 and sri.length_key = $3 and sri.size = $4
       and (sr.state = 'consumed' or (sr.state = 'held' and sr.expires_at > now()))`,
    [variant.productId, variant.shapeKey, variant.lengthKey, variant.size],
  );
  return rows[0]?.n ?? 0;
}

/** Make exactly `free` units purchasable, whatever earlier runs left behind:
 * the source quantity becomes what is already allocated plus `free`. */
export async function setFreeUnits(variant: PurchasableVariant, free: number): Promise<void> {
  const quantity = (await allocatedUnits(variant)) + free;
  const key = [variant.productId, variant.shapeKey, variant.lengthKey, variant.size];
  if (quantity <= 0) {
    await pool.query(
      `delete from product_availability
       where product_id = $1 and shape_key = $2 and length_key = $3 and size = $4`,
      key,
    );
    return;
  }
  await pool.query(
    `insert into product_availability (product_id, shape_key, length_key, size, quantity)
     values ($1, $2, $3, $4, $5)
     on conflict (product_id, shape_key, length_key, size) do update set quantity = excluded.quantity`,
    [...key, quantity],
  );
}

export async function addCartLine(
  request: APIRequestContext,
  token: string,
  variant: PurchasableVariant,
  quantity = 1,
): Promise<void> {
  await apiJson(request, 'POST', '/account/cart', {
    token,
    data: {
      productId: variant.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
      quantity,
    },
    expectedStatus: 200,
  });
}

/** Register `count` accounts one after another (registration is not what is
 * under test), each with an address, a started checkout session and, when
 * given, one line of `variant` in its cart. */
export async function prepareBuyers(
  request: APIRequestContext,
  count: number,
  variant?: PurchasableVariant,
): Promise<RaceBuyer[]> {
  const buyers: RaceBuyer[] = [];
  for (let index = 0; index < count; index += 1) {
    const user = await registerUser(request);
    const address = await createAddress(request, user.accessToken);
    if (variant) await addCartLine(request, user.accessToken, variant);
    buyers.push({
      email: user.email,
      accessToken: user.accessToken,
      addressId: address.id,
      checkoutSession: await startCheckoutSession(request, user.accessToken),
    });
  }
  return buyers;
}

export function freeCheckout(
  request: APIRequestContext,
  buyer: RaceBuyer,
  voucherCode: string,
): Promise<{ status: number; body: { order?: { id?: string }; error?: { code?: string } } }> {
  return apiJson<{ order?: { id?: string }; error?: { code?: string } }>(
    request,
    'POST',
    '/account/checkout/free',
    {
      token: buyer.accessToken,
      checkoutSession: buyer.checkoutSession,
      data: { addressId: buyer.addressId, courierCode: testCourierCode, express: false, voucherCode },
    },
  );
}

/** Status histogram, e.g. `{ 201: 3, 409: 5 }`, for readable assertions. */
export function statusCounts(results: Array<{ status: number }>): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const { status } of results) counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}

export function serverErrors(results: Array<{ status: number }>): number {
  return results.filter(({ status }) => status >= 500).length;
}

/** A composed set of three single nails (the smallest set compose accepts in
 * the API contract suite), all of that nail's first offered variant. */
export async function compositionBody(
  request: APIRequestContext,
  nailProductUid: string,
): Promise<{ size: string; quantity: number; nails: Array<Record<string, string>> }> {
  const { body } = await apiJson<{
    id: string;
    available?: Record<string, Record<string, Record<string, number>>>;
  }>(request, 'GET', `/gallery/nail/${encodeURIComponent(nailProductUid)}`, { expectedStatus: 200 });
  for (const [shapeKey, lengths] of Object.entries(body.available ?? {})) {
    for (const [lengthKey, sizes] of Object.entries(lengths)) {
      const size = ['M', 'S', 'L', 'XS'].find((candidate) => (sizes[candidate] ?? 0) > 0);
      if (!size) continue;
      return {
        size,
        quantity: 1,
        nails: ['left-thumb', 'left-index', 'right-thumb'].map((finger) => ({
          productId: body.id,
          shapeKey,
          lengthKey,
          finger,
        })),
      };
    }
  }
  throw new Error(`nail ${nailProductUid} has no offered variant`);
}
