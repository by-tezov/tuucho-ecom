import type pg from 'pg';
import type { Language } from '../../../utils/language.js';
import { failGift } from '../domain/errors.js';
import { assertReceiverCanMutate } from '../domain/access.js';
import { giftConstraintViolation } from '../domain/remaining.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import {
  countOpenGiftCartsForUser,
  lockGiverPromises,
  lockOfferById,
  updateOfferFields,
  type GiftOfferRow,
} from '../infrastructure/giftOfferRepo.js';
import { listGiftItems } from '../infrastructure/giftItemRepo.js';
import { ensureGiftCart } from '../infrastructure/giftCart.js';
import {
  insertCompositionIntoCart,
  listCompositionsForCart,
  type CompositionWriteInput,
} from '../../cart/application/composition.js';
import { loadCompositionsForCheckout } from '../../cart/application/compositionCheckout.js';

async function ensureOfferCart(client: pg.PoolClient, offer: GiftOfferRow): Promise<string> {
  if (!offer.giverUserId) failGift('invalid_request');
  // Creating the giver's gift cart opens a promise: same per-giver limit as
  // receiverConfirm, which skips its own check once the cart exists.
  if (!offer.cartId) {
    await lockGiverPromises(client, offer.giverUserId);
    const settings = await getGiftSettings(client);
    const open = await countOpenGiftCartsForUser(client, offer.giverUserId);
    if (open >= settings.maxOpenPromisesPerGiver) failGift('invalid_request');
  }
  const cartId = await ensureGiftCart(client, offer.giverUserId, offer.id, offer.receiverName);
  if (offer.cartId !== cartId) {
    await updateOfferFields(client, offer.id, { cartId });
  }
  return cartId;
}

async function assertCompositionBudget(
  client: pg.PoolClient,
  offer: GiftOfferRow,
  cartId: string,
): Promise<void> {
  const items = await listGiftItems(client, offer.id);
  const compositions = await loadCompositionsForCheckout(client, cartId);
  if (compositions.some((row) => !row.available)) failGift('gift_stock_unavailable');
  const violation = giftConstraintViolation(offer, [
    ...items.map((item) => ({
      productType: item.productType,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
    ...compositions.map((row) => ({
      productType: 'composition',
      unitPrice: row.unitPrice,
      quantity: row.quantity,
    })),
  ]);
  if (violation) failGift(violation);
}

const RECEIVER_COMPOSITION_INVALID = new Set([
  'price_missing',
  'invalid_composition_product',
  'invalid_request',
  'invalid_size',
  'empty',
  'too_many',
  'missing_finger',
  'invalid_finger',
  'duplicate_finger',
  'invalid_price',
]);

export async function listReceiverCompositions(
  pool: pg.Pool,
  offer: GiftOfferRow,
  language: Language,
) {
  if (!offer.cartId) return [];
  return listCompositionsForCart(pool, offer.cartId, language);
}

export async function putReceiverComposition(
  pool: pg.Pool,
  offer: GiftOfferRow,
  input: CompositionWriteInput,
  language: Language,
  compositionId?: string,
) {
  assertReceiverCanMutate(offer.status);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await lockOfferById(client, offer.id);
    if (!locked) failGift('not_found');
    assertReceiverCanMutate(locked.status);
    const cartId = await ensureOfferCart(client, locked);
    if (compositionId) {
      await client.query(`delete from cart_compositions where id = $1 and cart_id = $2`, [
        compositionId,
        cartId,
      ]);
    }
    const id = await insertCompositionIntoCart(client, cartId, input);
    await assertCompositionBudget(client, locked, cartId);
    await client.query('commit');
    const compositions = await listCompositionsForCart(pool, cartId, language);
    const created = compositions.find((row) => row.id === id);
    if (!created) failGift('invalid_request');
    return created;
  } catch (error) {
    await client.query('rollback');
    if (error instanceof Error) {
      // The codes validateComposition and resolveWriteNails actually throw;
      // the old prefix match (`empty_`, `finger_`) missed most of them and
      // turned a sold-out nail or a bad size into a 500.
      if (error.message === 'unavailable') failGift('gift_stock_unavailable');
      if (
        RECEIVER_COMPOSITION_INVALID.has(error.message) ||
        error.message.startsWith('composition_')
      ) {
        failGift('invalid_request');
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteReceiverComposition(
  pool: pg.Pool,
  offer: GiftOfferRow,
  compositionId: string,
): Promise<void> {
  assertReceiverCanMutate(offer.status);
  if (!offer.cartId) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await lockOfferById(client, offer.id);
    if (!locked) failGift('not_found');
    assertReceiverCanMutate(locked.status);
    await client.query(`delete from cart_compositions where id = $1 and cart_id = $2`, [
      compositionId,
      locked.cartId,
    ]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
