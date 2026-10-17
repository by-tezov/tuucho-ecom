import type pg from 'pg';
import type { PartialTrilingual } from '../../../../types.js';
import type { PickupPoint } from '../../../customers/addresses/application/addresses.js';
import type { CheckoutCartRulesState } from '../../domain/checkoutQuote.js';
import type { AccessoryType } from '../../../catalog/domain/accessoryPacks.js';
import {
  dbPackPrices,
  dbPacks,
  packMultiplier,
  resolvePackPrice,
  stockUnitsForLine,
} from '../../../catalog/domain/accessoryPacks.js';
import { type OrderItemColorSnapshot, type OrderItemPhotoSnapshot } from '../../domain/order.js';

export async function loadShapePhotos(
  client: pg.Pool | pg.PoolClient,
  productId: string,
  shapeKey: string,
  lengthKey: string,
): Promise<OrderItemPhotoSnapshot[]> {
  const { rows } = await client.query<{
    position: number;
    small_path: string;
    modal_path: string;
    content_hash: string;
  }>(
    `select "position", small_path, modal_path, content_hash
     from product_photos
     where product_id = $1 and shape_key = $2 and length_key = $3
     order by "position"`,
    [productId, shapeKey, lengthKey],
  );
  return rows.map((row) => ({
    position: row.position,
    smallPath: row.small_path,
    modalPath: row.modal_path,
    hash: row.content_hash,
  }));
}

type ShapePhotoLookup = { productId: string; shapeKey: string; lengthKey: string };

export function shapePhotoKey(lookup: ShapePhotoLookup): string {
  return JSON.stringify([lookup.productId, lookup.shapeKey, lookup.lengthKey]);
}

/** Loads all photo variants needed by one pricing pass in one query. The
 * previous per-line lookup made a ten-line cart hold the checkout transaction
 * open across ten independent round trips. Product ids are intentionally the
 * only SQL filter; the exact shape/length key is applied while grouping. */
export async function loadShapePhotosBatch(
  client: pg.Pool | pg.PoolClient,
  lookups: ShapePhotoLookup[],
): Promise<Map<string, OrderItemPhotoSnapshot[]>> {
  const uniqueLookups = [...new Map(lookups.map((lookup) => [shapePhotoKey(lookup), lookup])).values()];
  const result = new Map<string, OrderItemPhotoSnapshot[]>();
  if (uniqueLookups.length === 0) return result;
  const productIds = [...new Set(uniqueLookups.map((lookup) => lookup.productId))];
  const { rows } = await client.query<{
    product_id: string;
    shape_key: string;
    length_key: string;
    position: number;
    small_path: string;
    modal_path: string;
    content_hash: string;
  }>(
    `select product_id, shape_key, length_key, "position", small_path, modal_path, content_hash
     from product_photos where product_id = any($1::uuid[])
     order by product_id, shape_key, length_key, "position"`,
    [productIds],
  );
  for (const row of rows) {
    const key = shapePhotoKey({
      productId: row.product_id,
      shapeKey: row.shape_key,
      lengthKey: row.length_key,
    });
    const photos = result.get(key) ?? [];
    photos.push({
      position: row.position,
      smallPath: row.small_path,
      modalPath: row.modal_path,
      hash: row.content_hash,
    });
    result.set(key, photos);
  }
  for (const lookup of uniqueLookups) {
    if (!result.has(shapePhotoKey(lookup))) result.set(shapePhotoKey(lookup), []);
  }
  return result;
}

export type CheckoutFailureReason =
  | 'empty_cart'
  | 'address_not_found'
  | 'billing_address_not_found'
  | 'payment_method_not_available'
  | 'price_missing'
  | 'size_unavailable'
  | 'courier_not_found'
  | 'courier_country_unavailable'
  | 'courier_network_unavailable'
  | 'recipient_phone_required'
  | 'shipping_overflow'
  | 'express_unavailable'
  | 'shipping_price_unavailable'
  | 'voucher_not_found'
  | 'voucher_disabled'
  | 'voucher_not_started'
  | 'voucher_expired'
  | 'voucher_depleted'
  | 'voucher_user_not_allowed'
  | 'voucher_user_limit_reached'
  | 'voucher_conditions_not_met'
  | 'voucher_forbidden_by_rule'
  | 'loyalty_insufficient'
  | 'loyalty_incompatible_with_voucher';

export interface StockReservationItem {
  product_id: string;
  shape_key: string;
  length_key: string;
  size: string;
  quantity: number;
}

export interface StockReservation {
  id: string;
  user_id: string | null;
  stripe_payment_intent_id: string | null;
  state: 'held' | 'consumed' | 'released';
  expires_at: string;
}

export interface PricedCheckout {
  address: {
    recipient_name: string | null;
    company_name: string | null;
    line1: string;
    line2: string | null;
    delivery_notes: string | null;
    postal_code: string;
    city: string;
    country_code: string;
    phone: string | null;
    pickup_points: Record<string, PickupPoint>;
  };
  billingAddress: {
    id: string | null;
    recipient_name: string | null;
    company_name: string | null;
    line1: string;
    line2: string | null;
    postal_code: string;
    city: string;
    country_code: string;
    phone: string | null;
  };
  billingSameAsShipping: boolean;
  customerType: 'particulier' | 'entreprise';
  courier: { id: string; code: string; name: PartialTrilingual };
  networkCode: string;
  pickupPoint: PickupPoint | null;
  items: {
    line: {
      /** Null for a plugin-owned parent line (children on the priced item). */
      product_id: string | null;
      product_type: string;
      shape_key: string;
      length_key: string;
      shape_label: PartialTrilingual | null;
      length_label: PartialTrilingual | null;
      size: string;
      pack_key: string;
      pack_label: PartialTrilingual | null;
      quantity: number;
      product_uid: string;
      title: PartialTrilingual;
      desc: PartialTrilingual;
      occasion: PartialTrilingual | null;
      colors: OrderItemColorSnapshot[];
      photo_path: string | null;
      photos: OrderItemPhotoSnapshot[];
      origin: 'user' | 'rule';
      locked: boolean;
      rule_code: string | null;
      loyalty_multiplier: number;
      source_id?: string;
      /** Customer note typed on the cart card. Optional: reservation
       * snapshots written before the column existed have none. */
      comment?: string | null;
    };
    unitPrice: number;
    lineTotal: number;
    childCount?: number;
    children?: unknown[];
  }[];
  subtotal: number;
  packetKey: string;
  shippingListFee: number;
  shippingFee: number;
  rulesItemDiscount: number;
  cartRules: CheckoutCartRulesState;
  extraLines: Array<{ id: string; pluginId: string; label: string; amount: number }>;
  plugins: Record<string, unknown>;
  total: number;
}

export type PriceCheckoutResult =
  { ok: true; priced: PricedCheckout } | { ok: false; reason: CheckoutFailureReason };

export function checkoutLineEconomics(line: {
  accessory_type: AccessoryType;
  accessory_packs: unknown;
  accessory_pack_prices: unknown;
  pack_key: string;
  quantity: number;
  unit_price: string | null;
  origin: 'user' | 'rule';
}): { unitPrice: number | undefined; stockUnits: number | undefined; minUnits: number | undefined } {
  if (line.origin === 'rule') return { unitPrice: 0, stockUnits: 0, minUnits: 0 };
  const catalogUnit = line.unit_price === null ? undefined : Number(line.unit_price);
  const packs = dbPacks(line.accessory_packs);
  const packPrices = dbPackPrices(line.accessory_pack_prices);
  if (line.accessory_type === 'byQuantity') {
    return {
      unitPrice: resolvePackPrice(catalogUnit, packPrices, packs, line.pack_key),
      stockUnits: stockUnitsForLine('byQuantity', packs, line.pack_key, line.quantity),
      minUnits: packMultiplier(packs, line.pack_key),
    };
  }
  return { unitPrice: catalogUnit, stockUnits: line.quantity, minUnits: 1 };
}

/** Read-only re-derivation of everything a checkout needs to charge and,
 * later, to actually create the order — address/courier compatibility,
 * cart snapshot, and price, all fresh from the DB right now. Shared by
 * createCheckoutIntent (to size the Stripe PaymentIntent) and confirmOrder
 * (to build the order it inserts) so the two can never compute a different
 * total for the same cart. Takes a bare pg.Pool for the pricing-preview
 * call and a pg.PoolClient for the transactional call inside confirmOrder —
 * both expose the same `.query` signature. The client only ever sends
 * addressId/courierCode/express — everything else here is re-derived and
 * re-validated, never trusted from the request (see CartPage's own
 * gray-out/price preview, which is a responsiveness convenience only, not a
 * security boundary). */
export interface PriceCheckoutOptions {
  userId: string;
  addressId: string;
  courierCode: string;
  express: boolean;
  voucherCode?: string;
  billingAddressId?: string;
  /** Fail the whole checkout when a line has no stock left. */
  checkAvailability?: boolean;
  /** A line with 0 available_quantity is dropped instead of failing the
   * whole checkout — reserveCart/confirmOrder use this; the cart-page
   * preview (priceCart) does not, so a customer still sees a hard
   * "unavailable" signal there rather than a silently shrunk total. */
  excludeUnavailable?: boolean;
  /** At confirmOrder time, the reservation being confirmed already holds
   * its own units — subtracting them again from available_quantity would
   * read the last unit of something as "0 available" and wrongly drop a
   * line the customer already paid for. Excluded from the allocated-sum
   * subquery below only, never from the empty_cart/checkAvailability
   * checks (which don't apply to confirmOrder's checkAvailability=false
   * call anyway). */
  excludeReservationId?: string;
  syncGiftLines?: boolean;
  applyLoyalty?: boolean;
  cartId?: string;
}

/**
 * Builds the snapshot of one priced line.
 *
 * This shape is what gets stored on the order, so it has to be identical
 * whether the buyer was signed in or a guest. It was previously written out
 * field by field in both pricing paths, which is how a field added to one
 * could quietly be missing from the other's order records.
 *
 * The two paths still differ in how they arrive here: an account cart has its
 * rule gifts synced into it beforehand, while a guest's are appended
 * afterwards at zero. Both hand the resolved unit price in.
 */
export function reasonFromCheckoutFilter(error: unknown): string | null {
  if (error && typeof error === 'object' && 'checkoutReason' in error) {
    return String((error as { checkoutReason: string }).checkoutReason);
  }
  return null;
}

export function buildPricedItem(input: {
  line: {
    product_id: string | null;
    product_type: string;
    shape_key: string;
    length_key: string;
    shape_label: PartialTrilingual | null;
    length_label: PartialTrilingual | null;
    size: string;
    pack_key: string;
    pack_label: PartialTrilingual | null;
    quantity: number;
    product_uid: string;
    title: PartialTrilingual;
    desc: PartialTrilingual;
    occasion: PartialTrilingual | null;
    origin: 'user' | 'rule';
    locked: boolean;
    rule_code: string | null;
    loyalty_multiplier: unknown;
    source_id?: string;
    comment?: string | null;
  };
  colors: OrderItemColorSnapshot[];
  photos: OrderItemPhotoSnapshot[];
  unitPrice: number;
  childCount?: number;
  children?: unknown[];
}): PricedCheckout['items'][number] {
  const unitPrice = input.unitPrice;
  return {
    line: {
      product_id: input.line.product_id,
      product_type: input.line.product_type,
      shape_key: input.line.shape_key,
      length_key: input.line.length_key,
      shape_label: input.line.shape_label,
      length_label: input.line.length_label,
      size: input.line.size,
      pack_key: input.line.pack_key,
      pack_label: input.line.pack_label,
      quantity: input.line.quantity,
      product_uid: input.line.product_uid,
      title: input.line.title,
      desc: input.line.desc,
      occasion: input.line.occasion,
      colors: input.colors,
      photo_path: input.photos[0]?.smallPath ?? null,
      photos: input.photos,
      origin: input.line.origin,
      locked: input.line.locked,
      rule_code: input.line.rule_code,
      loyalty_multiplier: Number(input.line.loyalty_multiplier ?? 1),
      ...(input.line.source_id ? { source_id: input.line.source_id } : {}),
      comment: input.line.comment ?? null,
    },
    unitPrice,
    lineTotal: Math.round(unitPrice * input.line.quantity * 100) / 100,
    ...(input.childCount !== undefined ? { childCount: input.childCount } : {}),
    ...(input.children ? { children: input.children } : {}),
  };
}
