import type pg from 'pg';
import * as cart from '@kernel/back/modules/cart/application/cart';
import * as addresses from '@kernel/back/modules/customers/addresses/application/addresses';
import { config } from '@kernel/back/config/env';
import * as orders from '@kernel/back/modules/orders/application/ordersFacade';
import { encryptJsonPii } from '@kernel/back/platform/security/piiCrypto';
import { failGift } from '../domain/errors.js';
import { canOpenPay } from '../domain/statuses.js';
import { frozenGiftSnapshot } from '../domain/snapshot.js';
import {
  findOfferByCartId,
  findOfferById,
  lockOfferById,
  updateOfferFields,
  type GiftOfferRow,
} from '../infrastructure/giftOfferRepo.js';
import {
  allocateGiftHold,
  releaseGiftHold,
  reservationHasPaymentIntent,
} from '../infrastructure/giftStock.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import { addDays } from './clocks.js';

export async function priceGiftCart(
  pool: pg.Pool,
  offer: GiftOfferRow,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  voucherCode: string | undefined,
  billingAddressId: string | undefined,
  applyLoyalty?: boolean,
): Promise<orders.PriceCheckoutResult> {
  if (!offer.cartId) failGift('gift_not_payable');
  return orders.priceCart(
    pool,
    userId,
    addressId,
    courierCode,
    express,
    voucherCode,
    billingAddressId,
    applyLoyalty,
    offer.cartId,
    offer.stockReservationId ?? undefined,
  );
}

export async function priceAccountCart(
  pool: pg.Pool,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  voucherCode: string | undefined,
  billingAddressId: string | undefined,
  applyLoyalty?: boolean,
): Promise<orders.PriceCheckoutResult> {
  const active = await cart.getActiveCart(pool, userId);
  if (active?.kind === 'gift') {
    const offer = await findOfferByCartId(pool, active.id);
    if (offer) {
      return priceGiftCart(
        pool,
        offer,
        userId,
        addressId,
        courierCode,
        express,
        voucherCode,
        billingAddressId,
        applyLoyalty,
      );
    }
  }
  return orders.priceCart(
    pool,
    userId,
    addressId,
    courierCode,
    express,
    voucherCode,
    billingAddressId,
    applyLoyalty,
  );
}

export async function reserveGiftCheckout(
  pool: pg.Pool,
  offer: GiftOfferRow,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  voucherCode: string | undefined,
  billingAddressId: string | undefined,
  applyLoyalty: boolean,
): Promise<orders.ReserveCartResult> {
  if (!offer.cartId) failGift('gift_not_payable');
  const releaseIds = offer.stockReservationId ? [offer.stockReservationId] : [];
  const reserved = await orders.reserveCart(
    pool,
    userId,
    addressId,
    courierCode,
    express,
    config.stockReservationTtlMs,
    voucherCode,
    billingAddressId,
    applyLoyalty,
    offer.cartId,
    releaseIds,
  );
  if (reserved.ok) {
    await updateOfferFields(pool, offer.id, {
      stockReservationId: reserved.reservationId,
      status: 'paying',
      assignedCourierCode: courierCode,
    });
  }
  return reserved;
}

export async function bindGiftOrder(
  pool: pg.Pool | pg.PoolClient,
  offerId: string,
  orderId: string,
): Promise<void> {
  const offer = await findOfferById(pool, offerId);
  if (!offer || offer.status === 'ordered') return;
  const settings = await getGiftSettings(pool);
  const snapshot = frozenGiftSnapshot({
    offerId: offer.id,
    giverDisplayName: offer.giverDisplayName,
    receiverName: offer.receiverName,
    giverEmail: offer.giverEmail,
    receiverEmail: offer.receiverEmail,
    giverComment: offer.giverComment,
    maxSets: offer.maxSets,
    maxBudget: offer.maxBudget,
    allowAccessories: offer.allowAccessories,
    maxAccessoryBudget: offer.maxAccessoryBudget,
    hideReceiverPrices: offer.hideReceiverPrices,
  });
  const enc = encryptJsonPii(snapshot);
  await pool.query(
    `update orders set gift_offer_id = $1, gift_snapshot = $2::jsonb where id = $3 and gift_offer_id is null`,
    [offerId, JSON.stringify({ enc }), orderId],
  );
  await updateOfferFields(pool, offerId, {
    status: 'ordered',
    orderId,
    receiverVisibleUntil: addDays(new Date(), settings.visibilityAfterTerminalDays),
  });
}

export async function bindGiftOrderFromReservation(
  pool: pg.Pool,
  reservationId: string,
  orderId: string,
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from gift_offers where stock_reservation_id = $1`,
    [reservationId],
  );
  if (!rows[0]) return;
  await bindGiftOrder(pool, rows[0].id, orderId);
}

/** Same as bindGiftOrderFromReservation, found through the PaymentIntent
 * (settlement replay, where the reservation id is not at hand). */
export async function bindGiftOrderFromPaymentIntent(
  pool: pg.Pool,
  paymentIntentId: string,
  orderId: string,
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `select g.id from gift_offers g
     join stock_reservations sr on sr.id = g.stock_reservation_id
     where sr.stripe_payment_intent_id = $1`,
    [paymentIntentId],
  );
  if (!rows[0]) return;
  await bindGiftOrder(pool, rows[0].id, orderId);
}

export async function assertGiverCheckoutUser(offer: GiftOfferRow, userId: string): Promise<void> {
  if (offer.giverUserId !== userId || !offer.cartId) failGift('gift_not_payable');
}

export async function reserveAccountCart(
  pool: pg.Pool,
  userId: string,
  addressId: string,
  courierCode: string,
  express: boolean,
  reservationTtlMs: number,
  voucherCode: string | undefined,
  billingAddressId: string | undefined,
  applyLoyalty: boolean,
): Promise<orders.ReserveCartResult> {
  const active = await cart.getActiveCart(pool, userId);
  if (active?.kind === 'gift') {
    const offer = await findOfferByCartId(pool, active.id);
    if (!offer || !canOpenPay(offer.status)) failGift('gift_not_payable');
    return reserveGiftCheckout(
      pool,
      offer,
      userId,
      addressId,
      courierCode,
      express,
      voucherCode,
      billingAddressId,
      applyLoyalty,
    );
  }
  return orders.reserveCart(
    pool,
    userId,
    addressId,
    courierCode,
    express,
    reservationTtlMs,
    voucherCode,
    billingAddressId,
    applyLoyalty,
  );
}

export async function accountCheckoutAddressFailure(
  pool: pg.Pool,
  userId: string,
  sessionId: string,
  addressId: string,
  billingAddressId?: string,
): Promise<'address_not_found' | 'billing_address_not_found' | undefined> {
  const active = await cart.getActiveCart(pool, userId);
  if (active?.kind === 'gift' && active.address_id === addressId) {
    if (!(await addresses.getForUser(pool, userId, addressId))) return 'address_not_found';
    if (billingAddressId && !(await addresses.getForCheckout(pool, userId, billingAddressId, sessionId))) {
      return 'billing_address_not_found';
    }
    return undefined;
  }
  if (!(await addresses.getForCheckout(pool, userId, addressId, sessionId))) return 'address_not_found';
  if (billingAddressId && !(await addresses.getForCheckout(pool, userId, billingAddressId, sessionId))) {
    return 'billing_address_not_found';
  }
  return undefined;
}

/** Checkout and loyalty previews must not treat this cart's own gift/checkout
 * hold as sold-out stock. */
export async function coveringStockReservationIdForActiveCart(
  pool: pg.Pool,
  userId: string,
): Promise<string | undefined> {
  const active = await cart.getActiveCart(pool, userId);
  if (!active || active.kind !== 'gift') return undefined;
  const offer = await findOfferByCartId(pool, active.id);
  return offer?.stockReservationId ?? undefined;
}

/** After Marc edits an unlocked gift cart, the hold and `gift_items` follow
 * the remaining user lines. A checkout PaymentIntent hold is left alone. */
export async function syncGiftHoldToActiveCart(pool: pg.Pool, userId: string): Promise<void> {
  const active = await cart.getActiveCart(pool, userId);
  if (!active || active.kind !== 'gift') return;
  const offer = await findOfferByCartId(pool, active.id);
  if (!offer || !canOpenPay(offer.status)) return;
  if (await reservationHasPaymentIntent(pool, offer.stockReservationId)) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await lockOfferById(client, offer.id);
    if (!locked || !canOpenPay(locked.status)) {
      await client.query('rollback');
      return;
    }
    if (await reservationHasPaymentIntent(client, locked.stockReservationId)) {
      await client.query('rollback');
      return;
    }
    const { rows: items } = await client.query<{
      product_id: string;
      shape_key: string;
      length_key: string;
      size: string;
      pack_key: string;
      quantity: number;
      product_type: string;
    }>(
      `select ci.product_id, ci.shape_key, ci.length_key, ci.size, ci.pack_key, ci.quantity, gs.product_type
       from cart_items ci
       join products gs on gs.id = ci.product_id
       where ci.cart_id = $1 and ci.origin = 'user'`,
      [active.id],
    );
    await releaseGiftHold(client, locked.stockReservationId);
    await client.query(`delete from gift_items where offer_id = $1`, [locked.id]);
    let nextHold: string | null = null;
    // Compositions use boolean availability and are not stock-reserved.
    // Catalogue lines still rebuild the hold when present.
    if (items.length > 0) {
      await client.query(
        `insert into gift_items (offer_id, product_id, shape_key, length_key, size, pack_key, quantity)
         select $1, unnest($2::uuid[]), unnest($3::text[]), unnest($4::text[]), unnest($5::text[]),
                unnest($6::text[]), unnest($7::integer[])`,
        [
          locked.id,
          items.map((item) => item.product_id),
          items.map((item) => item.shape_key),
          items.map((item) => item.length_key),
          items.map((item) => item.size),
          items.map((item) => item.pack_key),
          items.map((item) => item.quantity),
        ],
      );
      const expiresAt =
        locked.holdExpiresAt ?? addDays(new Date(), (await getGiftSettings(client)).stockHoldTtlDays);
      nextHold = await allocateGiftHold(
        client,
        locked.giverUserId,
        items.map((item) => ({
          productId: item.product_id,
          shapeKey: item.shape_key,
          lengthKey: item.length_key,
          size: item.size,
          packKey: item.pack_key,
          quantity: item.quantity,
          unitPrice: 0,
          productUid: '',
          productType: item.product_type,
        })),
        expiresAt,
      );
    }
    await updateOfferFields(client, locked.id, { stockReservationId: nextHold });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
