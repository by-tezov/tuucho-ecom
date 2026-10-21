import type pg from 'pg';
import { getGiftDestination, type GiftOfferRow } from '../infrastructure/giftOfferRepo.js';
import { listGiftItems } from '../infrastructure/giftItemRepo.js';
import {
  attachGiftDestinationAddress,
  replaceGiftCartLines,
  setGiftCartCheckout,
} from '../infrastructure/giftCart.js';

/** Copy Julie’s current items, courier, and a one-time delivery address onto
 * Marc’s `kind=gift` cart. Call after the offer transaction commits —
 * `addresses.create` opens its own client. */
export async function syncGiverCartFromOffer(pool: pg.Pool, offer: GiftOfferRow): Promise<void> {
  if (!offer.cartId || !offer.giverUserId) return;
  const client = await pool.connect();
  let destination: Awaited<ReturnType<typeof getGiftDestination>>;
  try {
    await client.query('begin');
    const items = await listGiftItems(client, offer.id);
    await replaceGiftCartLines(client, offer.cartId, items);
    destination = await getGiftDestination(client, offer.id);
    await setGiftCartCheckout(client, offer.cartId, {
      courierCode: destination?.courierCode ?? offer.assignedCourierCode,
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  if (destination) {
    await attachGiftDestinationAddress(pool, offer.giverUserId, offer.cartId, destination);
  }
}
