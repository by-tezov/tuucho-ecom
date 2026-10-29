import type pg from 'pg';
import { resolveCheckoutCourier } from '../../../delivery/application/checkoutCourier.js';
import { priceMerchandiseAndShipping } from '../../domain/checkoutTotals.js';
import type { PartialTrilingual } from '../../../../types.js';
import type { PickupPoint } from '../../../customers/addresses/application/addresses.js';
import type { AccessoryType } from '../../../catalog/domain/accessoryPacks.js';
import { applyFilters } from '../../../plugins/application/hooks.js';
import { applyCheckoutQuoteFilters, runCheckoutPrepare } from '../checkoutOpenings.js';
import { importEnabledPlugin } from '../../../plugins/application/pluginModules.js';
import type { CheckoutQuote } from '../../domain/checkoutQuote.js';
import { type OrderItemColorSnapshot } from '../../domain/order.js';
import { roundMoney as round2 } from '../../../commerce/domain/checkoutMoney.js';
import {
  type PriceCheckoutResult,
  type PricedCheckout,
  checkoutLineEconomics,
  loadShapePhotos,
  loadShapePhotosBatch,
  shapePhotoKey,
  buildPricedItem,
  reasonFromCheckoutFilter,
} from './checkoutPricingTypes.js';

export interface GuestLineInput {
  productId: string;
  /** '' for accessories, matching cart_items' own empty-string convention. */
  shapeKey: string;
  lengthKey: string;
  size: string;
  packKey: string;
  quantity: number;
  /** Customer note typed on the cart card; null when none. */
  comment: string | null;
}

export interface GuestAddressInput {
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  /** Same role as authenticated addresses' address_networks row: which
   * delivery networks this address is eligible for (e.g. both 'home' and a
   * Mondial Relay pickup network) — there is no such table row for a
   * one-shot guest address, so the client declares it directly. */
  networkCodes: string[];
  /** Keyed by network code, same shape as a saved address's pickup_points
   * column — the specific relay/locker chosen via the picker for whichever
   * network ends up matched. */
  pickupPoints: Record<string, PickupPoint>;
  /** Guest address-book label; only persisted when savedForFuture is true. */
  label?: string | null;
  /** Opt-in: store a pending saved address until a manage-order token claims it. */
  savedForFuture?: boolean;
}

export function guestAddressSnapshot(address: GuestAddressInput): PricedCheckout['billingAddress'] & {
  delivery_notes: string | null;
  pickup_points: Record<string, PickupPoint>;
} {
  return {
    id: null,
    recipient_name: address.recipientName,
    company_name: address.companyName,
    line1: address.line1,
    line2: address.line2,
    delivery_notes: address.deliveryNotes,
    postal_code: address.postalCode,
    city: address.city,
    country_code: address.countryCode,
    phone: address.phone,
    pickup_points: {},
  };
}

/** Guest-checkout sibling of priceCheckout — same per-line pricing
 * (checkoutLineEconomics), courier/country compatibility checks, and
 * cart-rule evaluation (gift_per_nail_set / nail_qty_percent_tiers /
 * free_shipping_above via evaluateCartRules), but against ad-hoc line items
 * and address fields passed directly instead of cart_items/carts/addresses
 * rows (nothing about a guest checkout attempt is persisted until an order
 * actually confirms) — so unlike priceCheckout's syncGiftLinesForActiveCart
 * (which mutates a persisted cart_items row), the gift line here is
 * resolved straight into priceItems each call, from scratch. v1 scope:
 * home delivery only (Point Relais pickup needs a saved address's own
 * address_networks row, which a one-shot guest address never has). A voucher
 * preview here (previewVoucher, non-mutating) passes no userId — a code
 * restricted to specific allowed_user_ids can never resolve for a guest, the
 * same voucher_user_not_allowed an unlisted authenticated customer would get. */
export async function priceGuestCheckout(
  client: pg.Pool | pg.PoolClient,
  items: GuestLineInput[],
  address: GuestAddressInput,
  courierCode: string,
  express: boolean,
  voucherCode?: string,
  billingAddress?: GuestAddressInput,
  guestEmail?: string,
  guestExtra?: unknown,
): Promise<PriceCheckoutResult> {
  const courierResult = await resolveCheckoutCourier(client, {
    courierCode,
    countryCode: address.countryCode,
    phone: address.phone,
    networks: { kind: 'declared', codes: address.networkCodes },
  });
  if (!courierResult.ok) return { ok: false, reason: courierResult.reason };
  const { courier, networkCode } = courierResult.resolved;
  const pickupPoint = address.pickupPoints[networkCode] ?? null;

  let cartLines: Array<{
    product_id: string;
    product_type: 'nail' | 'accessory';
    accessory_type: AccessoryType;
    accessory_packs: unknown;
    accessory_pack_prices: unknown;
    shape_key: string;
    length_key: string;
    size: string;
    pack_key: string;
    quantity: number;
    product_uid: string;
    title: PartialTrilingual;
    desc: PartialTrilingual;
    occasion: PartialTrilingual | null;
    shape_label: PartialTrilingual | null;
    length_label: PartialTrilingual | null;
    pack_label: PartialTrilingual | null;
    unit_price: string | null;
    available_quantity: number;
    loyalty_multiplier: number;
    comment: string | null;
  }> = [];
  if (items.length > 0) {
    const result = await client.query<{
      product_id: string;
      product_type: 'nail' | 'accessory';
      accessory_type: AccessoryType;
      accessory_packs: unknown;
      accessory_pack_prices: unknown;
      shape_key: string;
      length_key: string;
      size: string;
      pack_key: string;
      quantity: number;
      product_uid: string;
      title: PartialTrilingual;
      desc: PartialTrilingual;
      occasion: PartialTrilingual | null;
      shape_label: PartialTrilingual | null;
      length_label: PartialTrilingual | null;
      pack_label: PartialTrilingual | null;
      unit_price: string | null;
      available_quantity: number;
      loyalty_multiplier: number;
      comment: string | null;
    }>(
      `select gi.product_id, gs.product_type, gs.accessory_type, gs.accessory_packs, gs.accessory_pack_prices,
            gs.loyalty_multiplier::float8 as loyalty_multiplier,
            gi.shape_key, gi.length_key, gi.size, gi.pack_key, gi.quantity, gi.comment,
            gs.product_uid, gs.title, gs."desc", gs.occasion,
            (select label from shapes where key = gi.shape_key) as shape_label,
            (select label from shape_lengths
             where shape_key = gi.shape_key and length_key = gi.length_key) as length_label,
            (select label from accessory_quantities where key = gi.pack_key) as pack_label,
            (select price::text from product_prices gsp
             where gsp.product_id = gi.product_id and gsp.effective_at <= now()
             order by gsp.effective_at desc limit 1) as unit_price,
            coalesce((
              select greatest(gsa.quantity - coalesce((
                select sum(sri.quantity)
                from stock_reservation_items sri
                join stock_reservations sr on sr.id = sri.reservation_id
                where sri.product_id = gsa.product_id
                  and sri.shape_key = gsa.shape_key
                  and sri.length_key = gsa.length_key
                  and sri.size = gsa.size
                  and (sr.state = 'consumed' or (sr.state = 'held' and sr.expires_at > now()))
              ), 0), 0)::integer
              from product_availability gsa
              where gsa.product_id = gi.product_id and gsa.shape_key = gi.shape_key
                and gsa.length_key = gi.length_key and gsa.size = gi.size
            ), 0) as available_quantity
     from unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::text[])
       as gi(product_id, shape_key, length_key, size, pack_key, quantity, comment)
     join products gs on gs.id = gi.product_id and gs.audience = 'public'`,
      [
        items.map((item) => item.productId),
        items.map((item) => item.shapeKey),
        items.map((item) => item.lengthKey),
        items.map((item) => item.size),
        items.map((item) => item.packKey),
        items.map((item) => item.quantity),
        items.map((item) => item.comment),
      ],
    );
    cartLines = result.rows;
  }
  // Every requested line must resolve to a real, publicly-purchasable
  // product. Unlike the authenticated cart (which can drop OOS/invalid
  // lines and let the customer notice in the UI), a guest checkout request
  // has no persisted cart to reconcile against — an unresolved line hard-
  // fails the whole request instead of silently checking out a subset.
  if (cartLines.length !== items.length) return { ok: false, reason: 'price_missing' };

  const economics = cartLines.map((line) => checkoutLineEconomics({ ...line, origin: 'user' }));
  if (economics.some((line) => line.unitPrice === undefined)) {
    return { ok: false, reason: 'price_missing' };
  }
  if (
    cartLines.some((line, i) => {
      const stockUnits = economics[i]!.stockUnits;
      return stockUnits === undefined || stockUnits > line.available_quantity;
    })
  ) {
    return { ok: false, reason: 'size_unavailable' };
  }

  const productIdsUnique = [...new Set(cartLines.map((line) => line.product_id))];
  const { rows: colorRows } = await client.query<{
    product_id: string;
    color_key: string;
    role: 'main' | 'secondary';
    label: PartialTrilingual;
  }>(
    `select gsc.product_id, gsc.color_key, gsc.role, c.label
     from product_colors gsc
     join colors c on c.key = gsc.color_key
     where gsc.product_id = any($1::uuid[]) and gsc.option_key = ''
     order by gsc.product_id, gsc.role, gsc.sort_order`,
    [productIdsUnique],
  );
  const colorsByProduct = new Map<string, OrderItemColorSnapshot[]>();
  for (const row of colorRows) {
    const list = colorsByProduct.get(row.product_id) ?? [];
    list.push({ key: row.color_key, role: row.role, label: row.label });
    colorsByProduct.set(row.product_id, list);
  }

  let priceItems: PricedCheckout['items'] = [];
  const photosByKey = await loadShapePhotosBatch(
    client,
    cartLines.map((line) => ({
      productId: line.product_id,
      shapeKey: line.pack_key || line.shape_key,
      lengthKey: line.pack_key ? '' : line.length_key,
    })),
  );
  for (let i = 0; i < cartLines.length; i += 1) {
    const line = cartLines[i]!;
    const photoShapeKey = line.pack_key || line.shape_key;
    const photoLengthKey = line.pack_key ? '' : line.length_key;
    const photos =
      photosByKey.get(
        shapePhotoKey({ productId: line.product_id, shapeKey: photoShapeKey, lengthKey: photoLengthKey }),
      ) ?? [];
    priceItems.push(
      buildPricedItem({
        line: { ...line, origin: 'user', locked: false, rule_code: null },
        colors: colorsByProduct.get(line.product_id) ?? [],
        photos,
        unitPrice: Number(economics[i]!.unitPrice),
      }),
    );
  }

  // Unlike the authenticated cart (whose gift lines are synced onto
  // persisted cart_items by syncGiftLinesForActiveCart before pricing, see
  // priceCheckout above), a guest checkout has no persisted cart to sync
  // onto — the gift lines are resolved here, ad hoc, straight into
  // priceItems by the same desiredGiftQuantities syncGiftLinesForCart uses.
  try {
    priceItems = await applyFilters('checkout.merchandise', priceItems, {
      client,
      guestExtra,
      checkAvailability: true,
      excludeUnavailable: false,
    });
  } catch (error) {
    const reason = reasonFromCheckoutFilter(error);
    if (reason) return { ok: false, reason: reason as never };
    throw error;
  }
  const cartRulesApi = await importEnabledPlugin<{
    listCartRules: (client: pg.Pool | pg.PoolClient) => Promise<unknown[]>;
    desiredGiftQuantities: (
      rules: unknown[],
      input: { setUnits: number; extraSets?: Array<{ quantity: number; nailCount: number }> },
    ) => Array<{ quantity: number; productUid: string; ruleCode: string }>;
  }>('tuucho-commerce-cart-rules', 'src/cartRules.ts');
  const rules = cartRulesApi ? await cartRulesApi.listCartRules(client) : [];
  const gifts = cartRulesApi
    ? cartRulesApi.desiredGiftQuantities(rules, {
        setUnits: priceItems
          .filter((item) => item.line.origin === 'user' && item.line.product_type === 'nail')
          .reduce((sum, item) => sum + item.line.quantity, 0),
        extraSets: priceItems
          .filter((item) => item.line.origin === 'user' && (item.childCount ?? 0) > 0)
          .map((item) => ({ quantity: item.line.quantity, nailCount: item.childCount ?? 0 })),
      })
    : [];
  for (const gift of gifts) {
    const desiredQty = gift.quantity;
    const { rows: giftProductRows } = await client.query<{
      id: string;
      product_type: 'nail' | 'accessory';
      product_uid: string;
      title: PartialTrilingual;
      desc: PartialTrilingual;
      occasion: PartialTrilingual | null;
    }>(
      `select id, product_type, product_uid, title, "desc", occasion
       from products where product_uid = $1 and audience = 'public'`,
      [gift.productUid],
    );
    const giftProduct = giftProductRows[0];
    if (!giftProduct) continue;
    const { rows: giftColorRows } = await client.query<{
      color_key: string;
      role: 'main' | 'secondary';
      label: PartialTrilingual;
    }>(
      `select gsc.color_key, gsc.role, c.label
       from product_colors gsc
       join colors c on c.key = gsc.color_key
       where gsc.product_id = $1 and gsc.option_key = ''
       order by gsc.role, gsc.sort_order`,
      [giftProduct.id],
    );
    const photos = await loadShapePhotos(client, giftProduct.id, '', '');
    priceItems.push({
      line: {
        product_id: giftProduct.id,
        product_type: giftProduct.product_type,
        shape_key: '',
        length_key: '',
        shape_label: null,
        length_label: null,
        size: '',
        pack_key: '',
        pack_label: null,
        quantity: desiredQty,
        product_uid: giftProduct.product_uid,
        title: giftProduct.title,
        desc: giftProduct.desc,
        occasion: giftProduct.occasion,
        colors: giftColorRows.map((row) => ({ key: row.color_key, role: row.role, label: row.label })),
        photo_path: photos[0]?.smallPath ?? null,
        photos,
        origin: 'rule',
        locked: true,
        rule_code: gift.ruleCode,
        loyalty_multiplier: 1,
      },
      unitPrice: 0,
      lineTotal: 0,
    });
  }

  const packetTiersResult = await client.query<{
    packet_key: string;
    max_quantity: number;
    price: unknown;
    express_price: unknown;
  }>(
    `select packet_key, max_quantity, price, express_price from courier_packets
     where courier_id = $1 order by sort_order`,
    [courier.id],
  );
  const priced = priceMerchandiseAndShipping({
    lines: priceItems.map((item) => ({
      productId: item.line.product_id ?? item.line.source_id ?? '',
      productUid: item.line.product_uid,
      productType: item.line.product_type,
      origin: item.line.origin,
      ruleCode: item.line.rule_code ?? null,
      quantity: item.line.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      nailCount: item.childCount,
    })),
    packetTiers: packetTiersResult.rows,
    countryCode: address.countryCode,
    express,
  });
  if (!priced.ok) return { ok: false, reason: priced.reason };
  const { merchandiseSubtotal, totalQuantity, packetKey, shippingListFee, cartRules } = priced.pricing;
  let quote: CheckoutQuote = {
    merchandiseSubtotal,
    shippingListFee,
    shippingFee: cartRules.shippingFee,
    totalQuantity,
    packetKey,
    rulesItemDiscount: cartRules.rulesItemDiscount,
    cartRules,
    extraLines: [],
    plugins: {},
    total: round2(merchandiseSubtotal + cartRules.shippingFee - cartRules.rulesItemDiscount),
    items: priceItems,
  };
  try {
    const prepared = await runCheckoutPrepare({
      client,
      voucherCode,
      applyLoyalty: false,
      pluginRequest: { voucherCode, applyLoyalty: false },
      guestEmail,
      countryCode: address.countryCode,
      guest: true,
      phase: 'afterPrice',
    });
    quote = await applyCheckoutQuoteFilters(quote, {
      client,
      voucherCode,
      applyLoyalty: false,
      pluginRequest: { voucherCode, applyLoyalty: false },
      guestEmail,
      countryCode: address.countryCode,
      ...prepared,
    });
  } catch (error) {
    const reason =
      error && typeof error === 'object' && 'checkoutReason' in error
        ? String((error as { checkoutReason: string }).checkoutReason)
        : null;
    if (reason) return { ok: false, reason: reason as never };
    throw error;
  }
  return {
    ok: true,
    priced: {
      address: guestAddressSnapshot(address),
      billingAddress: guestAddressSnapshot(billingAddress ?? address),
      billingSameAsShipping: !billingAddress,
      customerType: address.companyName ? 'entreprise' : 'particulier',
      courier,
      networkCode: networkCode,
      pickupPoint,
      items: priceItems,
      subtotal: quote.merchandiseSubtotal,
      packetKey: quote.packetKey,
      shippingListFee: quote.shippingListFee,
      shippingFee: quote.shippingFee,
      rulesItemDiscount: quote.rulesItemDiscount,
      cartRules: quote.cartRules,
      extraLines: quote.extraLines ?? [],
      plugins: quote.plugins ?? {},
      total: round2(quote.total),
    },
  };
}
