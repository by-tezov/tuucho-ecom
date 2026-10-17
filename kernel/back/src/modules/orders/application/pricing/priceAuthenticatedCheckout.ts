import type pg from 'pg';
import { resolveCheckoutCourier } from '../../../delivery/application/checkoutCourier.js';
import { priceMerchandiseAndShipping } from '../../domain/checkoutTotals.js';
import type { PartialTrilingual } from '../../../../types.js';
import type { PickupPoint } from '../../../customers/addresses/application/addresses.js';
import type { AccessoryType } from '../../../catalog/domain/accessoryPacks.js';
import { applyFilters } from '../../../plugins/application/hooks.js';
import { applyCheckoutQuoteFilters } from '../checkoutOpenings.js';
import type { CheckoutQuote } from '../../domain/checkoutQuote.js';
import { type OrderItemColorSnapshot } from '../../domain/order.js';
import { decryptAddressPiiFields } from '../../infrastructure/orderRows.js';
import { roundMoney as round2 } from '../../../commerce/domain/checkoutMoney.js';
import {
  type PriceCheckoutOptions,
  type PriceCheckoutResult,
  type PricedCheckout,
  checkoutLineEconomics,
  loadShapePhotosBatch,
  shapePhotoKey,
  buildPricedItem,
  reasonFromCheckoutFilter,
} from './checkoutPricingTypes.js';

export async function priceCheckout(
  client: pg.Pool | pg.PoolClient,
  options: PriceCheckoutOptions,
): Promise<PriceCheckoutResult> {
  const {
    userId,
    addressId,
    courierCode,
    express,
    voucherCode,
    billingAddressId,
    checkAvailability = true,
    excludeUnavailable = false,
    excludeReservationId,
    syncGiftLines = true,
    applyLoyalty: applyLoyaltyOverride,
    cartId,
  } = options;
  const { rows: addressRows } = await client.query<{
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
  }>(
    `select recipient_name, company_name, line1, line2, delivery_notes, postal_code, city, country_code, phone, pickup_points
     from addresses where id = $1 and user_id = $2
       and (
         (saved_for_future and checkout_use_status = 'saved')
         or (not saved_for_future and checkout_use_status = 'one_time_available')
       )`,
    [addressId, userId],
  );
  const addressRaw = addressRows[0];
  if (!addressRaw) return { ok: false, reason: 'address_not_found' };
  const address = decryptAddressPiiFields(addressRaw);

  // No billingAddressId means "same as delivery" — the delivery address's
  // own fields double as the billing snapshot. Otherwise it must be one of
  // the caller's own facturation-kind addresses (never a livraison one, and
  // never someone else's row).
  let billingAddress: PricedCheckout['billingAddress'];
  const billingSameAsShipping = !billingAddressId;
  if (billingAddressId) {
    const { rows: billingRows } = await client.query<{
      id: string;
      recipient_name: string | null;
      company_name: string | null;
      line1: string;
      line2: string | null;
      postal_code: string;
      city: string;
      country_code: string;
      phone: string | null;
    }>(
      `select id, recipient_name, company_name, line1, line2, postal_code, city, country_code, phone
       from addresses where id = $1 and user_id = $2 and kind = 'facturation'
         and (
           (saved_for_future and checkout_use_status = 'saved')
           or (not saved_for_future and checkout_use_status = 'one_time_available')
         )`,
      [billingAddressId, userId],
    );
    const billingRow = billingRows[0];
    if (!billingRow) return { ok: false, reason: 'billing_address_not_found' };
    billingAddress = decryptAddressPiiFields(billingRow);
  } else {
    billingAddress = { id: null, ...address };
  }
  // The order's customer_type reflects whichever address actually serves as
  // its billing identity — the facturation address when one was used,
  // otherwise the delivery address itself (see OrderRow's own doc comment).
  const customerType: 'particulier' | 'entreprise' = billingAddress.company_name
    ? 'entreprise'
    : 'particulier';

  const courierResult = await resolveCheckoutCourier(client, {
    courierCode,
    countryCode: address.country_code,
    phone: address.phone,
    networks: { kind: 'savedAddress', addressId },
  });
  if (!courierResult.ok) return { ok: false, reason: courierResult.reason };
  const { courier, networkCode } = courierResult.resolved;
  const pickupPoint = address.pickup_points[networkCode] ?? null;

  try {
    await applyFilters('checkout.prepare', {
      client,
      userId,
      cartId,
      syncGiftLines,
    });
  } catch (error) {
    const reason = reasonFromCheckoutFilter(error);
    if (reason) return { ok: false, reason: reason as never };
    throw error;
  }

  const { rows: cartLines } = await client.query<{
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
    origin: 'user' | 'rule';
    locked: boolean;
    rule_code: string | null;
    loyalty_multiplier: number;
    comment: string | null;
  }>(
    `select ci.product_id, gs.product_type, gs.accessory_type, gs.accessory_packs, gs.accessory_pack_prices,
            gs.loyalty_multiplier::float8 as loyalty_multiplier,
            ci.shape_key, ci.length_key, ci.size, ci.pack_key, ci.quantity, gs.product_uid, gs.title, gs."desc", gs.occasion,
            (select label from shapes where key = ci.shape_key) as shape_label,
            (select label from shape_lengths
             where shape_key = ci.shape_key and length_key = ci.length_key) as length_label,
            (select label from accessory_quantities where key = ci.pack_key) as pack_label,
            (select price::text from product_prices gsp
             where gsp.product_id = ci.product_id and gsp.effective_at <= now()
             order by gsp.effective_at desc limit 1) as unit_price,
            -- 0 (not null) when there's no product_availability row at
            -- all — a shape/length/size that's never been given an
            -- "available" entry is 0 in stock, no exceptions (see
            -- getAvailableQuantity's doc comment).
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
                  and ($2::uuid is null or sr.id is distinct from $2)
              ), 0), 0)::integer
              from product_availability gsa
              where gsa.product_id = ci.product_id and gsa.shape_key = ci.shape_key
                and gsa.length_key = ci.length_key and gsa.size = ci.size
            ), 0) as available_quantity,
            ci.origin, ci.locked, cr.code as rule_code, ci.comment
     from cart_items ci
     join carts c on c.id = ci.cart_id
     join products gs on gs.id = ci.product_id
     left join cart_rules cr on cr.id = ci.rule_id
     where c.user_id = $1 and (($3::uuid is null and c.is_active = true) or c.id = $3)
       and (gs.audience = 'public' or exists (
         select 1 from product_user_library_users pulu where pulu.product_id = gs.id and pulu.user_id = $1
       ))`,
    [userId, excludeReservationId ?? null, cartId ?? null],
  );

  const { rows: cartIdRows } = await client.query<{ id: string }>(
    `select id from carts
     where user_id = $1 and (($2::uuid is null and is_active = true) or id = $2)
     limit 1`,
    [userId, cartId ?? null],
  );
  const resolvedCartId = cartIdRows[0]?.id;
  if (!resolvedCartId) return { ok: false, reason: 'empty_cart' };

  if (cartLines.length === 0) {
    // Plugin merchandise (custom sets) may still fill the quote.
  }

  // Drop fully unsellable *user* lines when requested (reserve/confirm/priceCart).
  // Rule/gift lines stay — they are server-owned and priced at 0.
  // Partial shortfalls (want 2 packs, remaining units only cover 1) still fail
  // below when checkAvailability is on — only remaining units < pack multiplier
  // (or 0 for scalar accessories/nails) are skipped so checkout can continue
  // for the rest of the cart.
  const linesForCheckout = excludeUnavailable
    ? cartLines.filter((line) => {
        if (line.origin === 'rule') return true;
        const { minUnits } = checkoutLineEconomics(line);
        return minUnits !== undefined && line.available_quantity >= minUnits;
      })
    : cartLines;
  const adjustedLines = linesForCheckout;
  if (
    adjustedLines.some((line) => {
      if (line.origin === 'rule') return false;
      return checkoutLineEconomics(line).unitPrice === undefined;
    })
  ) {
    return { ok: false, reason: 'price_missing' };
  }
  // Re-checked here (not just at cart add/update time) since stock can
  // change underneath an item that's been sitting in the cart for a while —
  // the full requested quantity must fit, not just "some" being available.
  if (
    checkAvailability &&
    adjustedLines.some((line) => {
      if (line.origin === 'rule') return false;
      const { stockUnits } = checkoutLineEconomics(line);
      return stockUnits === undefined || stockUnits > line.available_quantity;
    })
  ) {
    return { ok: false, reason: 'size_unavailable' };
  }

  const productIds = [...new Set(adjustedLines.map((line) => line.product_id))];
  const colorsByProduct = new Map<string, OrderItemColorSnapshot[]>();
  if (productIds.length > 0) {
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
      [productIds],
    );
    for (const row of colorRows) {
      const list = colorsByProduct.get(row.product_id) ?? [];
      list.push({ key: row.color_key, role: row.role, label: row.label });
      colorsByProduct.set(row.product_id, list);
    }
  }

  const items: PricedCheckout['items'] = [];
  const photosByKey = await loadShapePhotosBatch(
    client,
    adjustedLines.map((line) => ({
      productId: line.product_id,
      shapeKey: line.pack_key || line.shape_key,
      lengthKey: line.pack_key ? '' : line.length_key,
    })),
  );
  for (const cartLine of adjustedLines) {
    const photoShapeKey = cartLine.pack_key || cartLine.shape_key;
    const photoLengthKey = cartLine.pack_key ? '' : cartLine.length_key;
    const photos =
      photosByKey.get(
        shapePhotoKey({ productId: cartLine.product_id, shapeKey: photoShapeKey, lengthKey: photoLengthKey }),
      ) ?? [];
    const { unitPrice: resolvedPrice } = checkoutLineEconomics(cartLine);
    items.push(
      buildPricedItem({
        line: cartLine,
        colors: colorsByProduct.get(cartLine.product_id) ?? [],
        photos,
        unitPrice: cartLine.origin === 'rule' ? 0 : Number(resolvedPrice),
      }),
    );
  }
  let merchandise = items;
  try {
    merchandise = await applyFilters('checkout.merchandise', merchandise, {
      client,
      userId,
      cartId: resolvedCartId,
      checkAvailability,
      excludeUnavailable,
    });
  } catch (error) {
    const reason = reasonFromCheckoutFilter(error);
    if (reason) return { ok: false, reason: reason as never };
    throw error;
  }
  if (merchandise.length === 0) return { ok: false, reason: 'empty_cart' };
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
    lines: merchandise.map((item) => ({
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
    countryCode: address.country_code,
    express,
  });
  if (!priced.ok) return { ok: false, reason: priced.reason };
  const { merchandiseSubtotal, totalQuantity, packetKey, shippingListFee, shippingFee, rulesItemDiscount, cartRules } =
    priced.pricing;

  const { rows: cartPrefRows } = await client.query<{ apply_loyalty: boolean }>(
    `select apply_loyalty from carts where user_id = $1 and (($2::uuid is null and is_active = true) or id = $2) limit 1`,
    [userId, cartId ?? null],
  );
  const applyLoyalty = applyLoyaltyOverride ?? cartPrefRows[0]?.apply_loyalty ?? false;
  let quote: CheckoutQuote = {
    merchandiseSubtotal,
    shippingListFee,
    shippingFee,
    totalQuantity,
    packetKey,
    rulesItemDiscount,
    cartRules,
    extraLines: [],
    plugins: {},
    total: round2(merchandiseSubtotal + shippingFee - rulesItemDiscount),
    items: merchandise,
  };
  try {
    quote = await applyCheckoutQuoteFilters(quote, {
      client,
      userId,
      cartId,
      voucherCode,
      applyLoyalty,
      pluginRequest: { voucherCode, applyLoyalty },
      countryCode: address.country_code,
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
      address,
      billingAddress,
      billingSameAsShipping,
      customerType,
      courier,
      networkCode: networkCode,
      pickupPoint,
      items: (quote.items as PricedCheckout['items']) ?? merchandise,
      subtotal: quote.merchandiseSubtotal,
      packetKey: quote.packetKey,
      shippingListFee: quote.shippingListFee,
      shippingFee: quote.shippingFee,
      rulesItemDiscount: quote.rulesItemDiscount,
      cartRules: quote.cartRules,
      extraLines: quote.extraLines ?? [],
      plugins: quote.plugins ?? {},
      total: quote.total,
    },
  };
}

/** Prices the caller's current cart against the chosen address/courier —
 * used to size a Stripe PaymentIntent before any charge happens. Doesn't
 * touch the DB beyond reads, so a plain pool is enough (no transaction: see
 * priceCheckout's own doc comment on why a slightly-stale read here is
 * fine — confirmOrder below re-derives and re-validates everything again,
 * authoritatively, once payment has actually succeeded).
 * `excludeReservationId` is the gift (or checkout) hold already covering
 * this cart, so those units still count as available for this preview. */
