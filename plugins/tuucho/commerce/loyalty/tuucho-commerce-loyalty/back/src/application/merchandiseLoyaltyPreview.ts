import type pg from 'pg';
import { type LoyaltyPricingResult } from './loyalty.js';
import { priceLoyaltyIfEnabled } from './loyaltyPlugin.js';
import {
  dbPackPrices,
  dbPacks,
  packMultiplier,
  resolvePackPrice,
  stockUnitsForLine,
  type AccessoryType,
} from '@kernel/back/modules/catalog/domain/accessoryPacks';
import { cartRulesApi, EMPTY_CART_RULES, vouchersApi } from '../pluginPeers.js';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type MerchandiseLoyaltyPreview = LoyaltyPricingResult & {
  total: number;
  merchandiseSubtotal: number;
  rulesItemDiscount: number;
};

type PricedLine = {
  line: {
    product_id: string;
    product_type: string;
    shape_key: string;
    length_key: string;
    size: string;
    origin: 'user' | 'rule';
    loyalty_multiplier: number;
  };
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  rule_code?: string | null;
};

function lineEconomics(line: {
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

/**
 * Loyalty earn/spend quote for the active account cart.
 * Paid merchandise only (after cart rules / voucher / wallet credit).
 * Address and courier are unused — shipping never earns or spends.
 * `excludeReservationId` is the gift/checkout hold already covering this cart.
 */
export async function previewAccountCartLoyalty(
  db: pg.Pool,
  userId: string,
  options: { applyLoyalty?: boolean; voucherCode?: string; excludeReservationId?: string } = {},
): Promise<{ ok: true; preview: MerchandiseLoyaltyPreview } | { ok: false; reason: string }> {
  await cartRulesApi()?.syncGiftLinesForActiveCart(db, userId);

  const { rows: cartLines } = await db.query<{
    product_id: string;
    product_type: string;
    accessory_type: AccessoryType;
    accessory_packs: unknown;
    accessory_pack_prices: unknown;
    shape_key: string;
    length_key: string;
    size: string;
    pack_key: string;
    quantity: number;
    unit_price: string | null;
    available_quantity: number;
    origin: 'user' | 'rule';
    rule_code: string | null;
    loyalty_multiplier: number;
  }>(
    `select ci.product_id, gs.product_type, gs.accessory_type, gs.accessory_packs, gs.accessory_pack_prices,
            gs.loyalty_multiplier::float8 as loyalty_multiplier,
            ci.shape_key, ci.length_key, ci.size, ci.pack_key, ci.quantity,
            (select price::text from product_prices gsp
             where gsp.product_id = ci.product_id and gsp.effective_at <= now()
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
                  and ($2::uuid is null or sr.id is distinct from $2)
              ), 0), 0)::integer
              from product_availability gsa
              where gsa.product_id = ci.product_id and gsa.shape_key = ci.shape_key
                and gsa.length_key = ci.length_key and gsa.size = ci.size
            ), 0) as available_quantity,
            ci.origin, cr.code as rule_code
     from cart_items ci
     join carts c on c.id = ci.cart_id
     join products gs on gs.id = ci.product_id
     left join cart_rules cr on cr.id = ci.rule_id
     where c.user_id = $1 and c.is_active = true
       and (gs.audience = 'public' or exists (
         select 1 from product_user_library_users pulu where pulu.product_id = gs.id and pulu.user_id = $1
       ))`,
    [userId, options.excludeReservationId ?? null],
  );

  if (cartLines.length === 0) {
    return { ok: false, reason: 'empty_cart' };
  }

  const rules = (await cartRulesApi()?.listCartRules(db)) ?? [];
  const sellable = cartLines.filter((line) => {
    if (line.origin === 'rule') return true;
    const { minUnits } = lineEconomics(line);
    return minUnits !== undefined && line.available_quantity >= minUnits;
  });
  if (sellable.length === 0) {
    return { ok: false, reason: 'empty_cart' };
  }

  const desiredGiftByRuleCode = new Map(
    (
      cartRulesApi()?.desiredGiftQuantities(rules, {
        setUnits: sellable
          .filter((line) => line.origin === 'user' && line.product_type === 'nail')
          .reduce((sum, line) => sum + line.quantity, 0),
      }) ?? []
    ).map((gift) => [gift.ruleCode, gift.quantity]),
  );

  const adjusted = sellable.flatMap((line) => {
    if (line.origin !== 'rule') return [line];
    const desired = desiredGiftByRuleCode.get(line.rule_code ?? '') ?? 0;
    if (desired <= 0) return [];
    return [{ ...line, quantity: desired }];
  });
  if (adjusted.length === 0) {
    return { ok: false, reason: 'empty_cart' };
  }

  const items: PricedLine[] = [];
  for (const cartLine of adjusted) {
    const { unitPrice: resolved } = lineEconomics(cartLine);
    if (cartLine.origin !== 'rule' && resolved === undefined) {
      return { ok: false, reason: 'price_missing' };
    }
    const unitPrice = cartLine.origin === 'rule' ? 0 : Number(resolved);
    items.push({
      line: {
        product_id: cartLine.product_id,
        product_type: cartLine.product_type,
        shape_key: cartLine.shape_key,
        length_key: cartLine.length_key,
        size: cartLine.size,
        origin: cartLine.origin,
        loyalty_multiplier: Number(cartLine.loyalty_multiplier ?? 1),
      },
      unitPrice,
      lineTotal: round2(unitPrice * cartLine.quantity),
      quantity: cartLine.quantity,
      rule_code: cartLine.rule_code,
    });
  }

  const applyLoyalty =
    options.applyLoyalty ??
    (
      await db.query<{ apply_loyalty: boolean }>(
        `select apply_loyalty from carts where user_id = $1 and is_active = true limit 1`,
        [userId],
      )
    ).rows[0]?.apply_loyalty ??
    false;

  const merchandiseSubtotal = round2(
    items.filter((item) => item.line.origin !== 'rule').reduce((sum, item) => sum + item.lineTotal, 0),
  );
  const nailLines = items
    .filter((item) => item.line.origin === 'user' && item.line.product_type === 'nail')
    .map((item) => ({ quantity: item.quantity, lineTotal: item.lineTotal }));
  const giftLines = items
    .filter((item) => item.line.origin === 'rule')
    .map((item) => ({
      productId: item.line.product_id,
      productUid: '',
      quantity: item.quantity,
      ruleCode: item.rule_code ?? '',
    }));
  const cartRules = cartRulesApi()?.evaluateCartRules({
    rules,
    nailLines,
    merchandiseSubtotal,
    shippingListFee: 0,
    countryCode: '',
    giftLines,
  }) ?? EMPTY_CART_RULES;
  if (options.voucherCode && cartRules.forbidVoucher) {
    return { ok: false, reason: 'voucher_forbidden_by_rule' };
  }

  const voucherMerchandiseSubtotal = round2(merchandiseSubtotal - cartRules.rulesItemDiscount);
  const voucherResult = options.voucherCode
    ? ((await vouchersApi()?.previewVoucher(
        db,
        options.voucherCode,
        {
          subtotal: voucherMerchandiseSubtotal,
          shippingFee: 0,
          totalQuantity: items
            .filter((item) => item.line.origin === 'user')
            .reduce((sum, item) => sum + item.quantity, 0),
          itemUnitPrices: items
            .filter((item) => item.line.origin !== 'rule')
            .map((item) => ({
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              productType: item.line.product_type as 'nail' | 'accessory',
            })),
        },
        userId,
      )) ?? { ok: false as const, reason: 'voucher_not_found' })
    : undefined;
  if (voucherResult && !voucherResult.ok) return voucherResult;
  const voucher = voucherResult?.ok
    ? (voucherResult.voucher as { itemDiscount?: number; offer?: { type?: string } })
    : null;

  const loyalty = await priceLoyaltyIfEnabled(db, {
    userId,
    applyLoyalty,
    items,
    merchandiseSubtotal,
    rulesItemDiscount: cartRules.rulesItemDiscount,
    voucherItemDiscount: voucher?.itemDiscount ?? 0,
    voucherShippingDiscount: 0,
    shippingFee: 0,
    voucherOfferType: voucher?.offer.type ?? null,
  });

  const total = round2(
    merchandiseSubtotal - cartRules.rulesItemDiscount - (voucher?.itemDiscount ?? 0) - loyalty.loyaltyCredit,
  );

  return {
    ok: true,
    preview: {
      ...loyalty,
      total,
      merchandiseSubtotal,
      rulesItemDiscount: cartRules.rulesItemDiscount,
    },
  };
}

export type GuestLoyaltyLineInput = {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  packKey: string;
  quantity: number;
};

/** Guest earn quote from cart lines only — no address/courier, no wallet spend. */
export async function previewGuestItemsLoyalty(
  db: pg.Pool,
  items: GuestLoyaltyLineInput[],
  voucherCode?: string,
): Promise<{ ok: true; preview: MerchandiseLoyaltyPreview } | { ok: false; reason: string }> {
  if (items.length === 0) return { ok: false, reason: 'empty_cart' };

  const { rows: cartLines } = await db.query<{
    product_id: string;
    product_type: string;
    accessory_type: AccessoryType;
    accessory_packs: unknown;
    accessory_pack_prices: unknown;
    shape_key: string;
    length_key: string;
    size: string;
    pack_key: string;
    quantity: number;
    unit_price: string | null;
    available_quantity: number;
    loyalty_multiplier: number;
  }>(
    `select gi.product_id, gs.product_type, gs.accessory_type, gs.accessory_packs, gs.accessory_pack_prices,
            gs.loyalty_multiplier::float8 as loyalty_multiplier,
            gi.shape_key, gi.length_key, gi.size, gi.pack_key, gi.quantity,
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
     from unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
       as gi(product_id, shape_key, length_key, size, pack_key, quantity)
     join products gs on gs.id = gi.product_id and gs.audience = 'public'`,
    [
      items.map((item) => item.productId),
      items.map((item) => item.shapeKey),
      items.map((item) => item.lengthKey),
      items.map((item) => item.size),
      items.map((item) => item.packKey),
      items.map((item) => item.quantity),
    ],
  );
  // A stale guest-cart line (deleted variant, or one with no current price)
  // is skipped rather than failing the whole preview; the cart page prunes it for real.
  const priced: PricedLine[] = [];
  for (const line of cartLines) {
    const economics = lineEconomics({ ...line, origin: 'user' });
    if (economics.unitPrice === undefined) continue;
    if (economics.stockUnits === undefined || economics.stockUnits > line.available_quantity) {
      return { ok: false, reason: 'size_unavailable' };
    }
    priced.push({
      line: {
        product_id: line.product_id,
        product_type: line.product_type,
        shape_key: line.shape_key,
        length_key: line.length_key,
        size: line.size,
        origin: 'user',
        loyalty_multiplier: Number(line.loyalty_multiplier ?? 1),
      },
      unitPrice: economics.unitPrice,
      lineTotal: round2(economics.unitPrice * line.quantity),
      quantity: line.quantity,
    });
  }

  const merchandiseSubtotal = round2(priced.reduce((sum, item) => sum + item.lineTotal, 0));
  const rules = (await cartRulesApi()?.listCartRules(db)) ?? [];
  const nailLines = priced
    .filter((item) => item.line.product_type === 'nail')
    .map((item) => ({ quantity: item.quantity, lineTotal: item.lineTotal }));
  const cartRules =
    cartRulesApi()?.evaluateCartRules({
      rules,
      nailLines,
      merchandiseSubtotal,
      shippingListFee: 0,
      countryCode: '',
      giftLines: [],
    }) ?? EMPTY_CART_RULES;
  if (voucherCode && cartRules.forbidVoucher) {
    return { ok: false, reason: 'voucher_forbidden_by_rule' };
  }

  const voucherMerchandiseSubtotal = round2(merchandiseSubtotal - cartRules.rulesItemDiscount);
  const voucherResult = voucherCode
    ? ((await vouchersApi()?.previewVoucher(db, voucherCode, {
        subtotal: voucherMerchandiseSubtotal,
        shippingFee: 0,
        totalQuantity: priced.reduce((sum, item) => sum + item.quantity, 0),
        itemUnitPrices: priced.map((item) => ({
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          productType: item.line.product_type as 'nail' | 'accessory',
        })),
      })) ?? { ok: false as const, reason: 'voucher_not_found' })
    : undefined;
  if (voucherResult && !voucherResult.ok) return voucherResult;
  const voucher = voucherResult?.ok
    ? (voucherResult.voucher as { itemDiscount?: number; offer?: { type?: string } })
    : null;

  const loyalty = await priceLoyaltyIfEnabled(db, {
    userId: null,
    applyLoyalty: false,
    items: priced,
    merchandiseSubtotal,
    rulesItemDiscount: cartRules.rulesItemDiscount,
    voucherItemDiscount: voucher?.itemDiscount ?? 0,
    voucherShippingDiscount: 0,
    shippingFee: 0,
    voucherOfferType: voucher?.offer.type ?? null,
  });

  const total = round2(merchandiseSubtotal - cartRules.rulesItemDiscount - (voucher?.itemDiscount ?? 0));

  return {
    ok: true,
    preview: {
      ...loyalty,
      total,
      merchandiseSubtotal,
      rulesItemDiscount: cartRules.rulesItemDiscount,
    },
  };
}
