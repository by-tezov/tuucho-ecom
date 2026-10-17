import type pg from 'pg';
import type { Language } from '@kernel/back/utils/language';
import { getAvailableQuantity } from '@kernel/back/modules/catalog/application/availability';
import { dbPacks, parseAccessoryType, stockUnitsForLine } from '@kernel/back/modules/catalog/domain/accessoryPacks';
import { failGift } from '../domain/errors.js';
import { assertReceiverCanMutate } from '../domain/access.js';
import { giftConstraintViolation } from '../domain/remaining.js';
import {
  getGiftDestination,
  lockOfferById,
  upsertGiftDestination,
  type GiftDestinationInput,
  type GiftOfferRow,
} from '../infrastructure/giftOfferRepo.js';
import {
  deleteGiftItem,
  listGiftItems,
  upsertGiftItem,
  type GiftItemRow,
} from '../infrastructure/giftItemRepo.js';
import { clocksOf, publicDestination, publicGiftItem, remainingFrom } from './presenters.js';
import { syncGiverCartFromOffer } from './syncGiverCart.js';

function receiverSummary(
  offer: GiftOfferRow,
  items: GiftItemRow[],
  destination: ReturnType<typeof publicDestination>,
) {
  const remaining = remainingFrom(offer, items);
  return {
    id: offer.id,
    status: offer.status,
    giverDisplayName: offer.giverDisplayName,
    receiverName: offer.receiverName,
    receiverEmail: offer.receiverEmail,
    giverComment: offer.giverComment,
    maxSets: offer.maxSets,
    maxBudget: offer.maxBudget,
    allowAccessories: offer.allowAccessories,
    maxAccessoryBudget: offer.maxAccessoryBudget,
    hideReceiverPrices: offer.hideReceiverPrices,
    remaining,
    clocks: clocksOf(offer),
    items: items.map((item) => publicGiftItem(item, offer.hideReceiverPrices)),
    destination,
    orderId: offer.orderId,
  };
}

export async function loadReceiverSummary(pool: pg.Pool, offer: GiftOfferRow, _language: Language = 'fr') {
  const [items, destination] = await Promise.all([
    listGiftItems(pool, offer.id),
    getGiftDestination(pool, offer.id),
  ]);
  const remaining = remainingFrom(offer, items);
  const summary = {
    ...receiverSummary(offer, items, publicDestination(destination)),
    remaining,
  };
  const orderFields = {
    orderNumber: null as string | null,
    orderStatus: null as string | null,
    orderConfirmedAt: null as string | null,
  };
  if (!offer.orderId) return { ...summary, ...orderFields };
  const { rows } = await pool.query<{
    order_number: string;
    status: string;
    confirmed_at: Date | string | null;
  }>(`select order_number, status, confirmed_at from orders where id = $1`, [offer.orderId]);
  const row = rows[0];
  if (!row) return { ...summary, ...orderFields };
  return {
    ...summary,
    orderNumber: row.order_number,
    orderStatus: row.status,
    orderConfirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
  };
}

async function assertSelectableProduct(
  client: pg.Pool | pg.PoolClient,
  productId: string,
): Promise<{ productType: 'nail' | 'accessory'; unitsFor: (packKey: string, quantity: number) => number }> {
  const { rows } = await client.query<{
    product_type: string;
    accessory_type: string | null;
    accessory_packs: unknown;
  }>(
    `select product_type, accessory_type, accessory_packs
     from products where id = $1 and hidden = false and audience = 'public'`,
    [productId],
  );
  const row = rows[0];
  if (!row) failGift('invalid_request');
  if (row.product_type === 'nail') {
    return { productType: 'nail', unitsFor: (_packKey, quantity) => quantity };
  }
  if (row.product_type === 'accessory') {
    const accessoryType = parseAccessoryType(row.accessory_type);
    const packs = dbPacks(row.accessory_packs);
    return {
      productType: 'accessory',
      unitsFor: (packKey, quantity) => {
        const units = stockUnitsForLine(accessoryType, packs, packKey, quantity);
        if (units === undefined) failGift('invalid_request');
        return units;
      },
    };
  }
  failGift('invalid_request');
}

export async function putReceiverItem(
  pool: pg.Pool,
  offer: GiftOfferRow,
  item: {
    productId: string;
    shapeKey: string;
    lengthKey: string;
    size: string;
    packKey: string;
    quantity: number;
  },
): Promise<GiftOfferRow> {
  assertReceiverCanMutate(offer.status);
  const client = await pool.connect();
  let synced: GiftOfferRow | undefined;
  try {
    await client.query('begin');
    const locked = await lockOfferById(client, offer.id);
    if (!locked) failGift('not_found');
    assertReceiverCanMutate(locked.status);
    const selectable = await assertSelectableProduct(client, item.productId);
    const units = selectable.unitsFor(item.packKey, item.quantity);
    const available = await getAvailableQuantity(
      client,
      item.productId,
      item.shapeKey,
      item.lengthKey,
      item.size,
    );
    if (item.quantity > 0 && available < units) failGift('gift_stock_unavailable');
    await upsertGiftItem(client, locked.id, item);
    const listed = await listGiftItems(client, locked.id);
    const violation = giftConstraintViolation(locked, listed);
    if (violation) failGift(violation);
    await client.query('commit');
    synced = locked;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  if (synced?.cartId && synced.giverUserId) {
    await syncGiverCartFromOffer(pool, synced);
  }
  return offer;
}

export async function removeReceiverItem(
  pool: pg.Pool,
  offer: GiftOfferRow,
  item: { productId: string; shapeKey: string; lengthKey: string; size: string },
): Promise<GiftOfferRow> {
  assertReceiverCanMutate(offer.status);
  await deleteGiftItem(pool, offer.id, item);
  if (offer.cartId && offer.giverUserId) {
    await syncGiverCartFromOffer(pool, offer);
  }
  return offer;
}

export async function putReceiverDestination(
  pool: pg.Pool,
  offer: GiftOfferRow,
  destination: GiftDestinationInput,
): Promise<GiftOfferRow> {
  assertReceiverCanMutate(offer.status);
  if (!destination.recipientName && !destination.companyName) failGift('invalid_request');
  if (!destination.line1 || !destination.postalCode || !destination.city || !destination.countryCode) {
    failGift('invalid_request');
  }
  if (!destination.courierCode) failGift('invalid_request');
  await upsertGiftDestination(pool, offer.id, destination);
  if (offer.cartId && offer.giverUserId) {
    await syncGiverCartFromOffer(pool, offer);
  }
  return offer;
}
