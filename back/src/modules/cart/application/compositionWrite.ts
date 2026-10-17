import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getNailVariantAvailabilityMap } from '../../catalog/application/availability.js';
import { getLatestPricesForSets } from '../../catalog/application/prices.js';
import { loadProductVariations, nailUnitPrice } from '../../catalog/application/productVariations.js';
import { validateComposition, type CompositionNailInput } from '../domain/composition.js';

/**
 * Writing a composition's rows, with no knowledge of whose cart it is.
 *
 * Kept apart from composition.ts on purpose: rebuy and the guest-cart merge
 * both live in cart.ts and need to drop a composition into a cart they have
 * already opened a transaction on. Importing composition.ts from there would
 * close a cycle (it reaches back for the active cart), which is why that call
 * used to go through a dynamic import.
 */
export type CompositionNailWrite = {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  finger: string;
  /** Variation option of a single nail with variations; `''`/absent otherwise. */
  variationKey?: string;
};

export type CompositionWriteInput = {
  size: string;
  quantity: number;
  nails: CompositionNailWrite[];
  /** Carried over by guest import and rebuy; the cart page sets it through
   * setCompositionComment. */
  comment?: string | null;
};

export async function resolveWriteNails(
  client: pg.PoolClient,
  size: string,
  nails: CompositionNailWrite[],
): Promise<CompositionNailInput[]> {
  const productIds = nails.map((nail) => nail.productId);
  const { rows: products } = await client.query<{ id: string; product_type: string }>(
    `select id, product_type from products where id = any($1::uuid[]) and hidden = false`,
    [productIds],
  );
  const byId = new Map(products.map((row) => [row.id, row]));
  const prices = await getLatestPricesForSets(client as unknown as pg.Pool, productIds);
  const variations = await loadProductVariations(client, productIds);
  // The offer rows carry the option (`''` for a nail without variations), so
  // a missing, unknown or switched-off option simply reads as unavailable.
  const availability = await getNailVariantAvailabilityMap(
    client,
    nails.map((nail) => ({
      productId: nail.productId,
      shapeKey: nail.shapeKey,
      lengthKey: nail.lengthKey,
      size,
      variationKey: nail.variationKey ?? '',
    })),
  );

  return nails.map((nail) => {
    const product = byId.get(nail.productId);
    if (!product || product.product_type !== 'nail_single') {
      throw new Error('invalid_composition_product');
    }
    const variationKey = nail.variationKey ?? '';
    const unitPrice = nailUnitPrice(prices.get(nail.productId), variations.get(nail.productId), variationKey);
    if (unitPrice === undefined) throw new Error('price_missing');
    return {
      productId: nail.productId,
      shapeKey: nail.shapeKey,
      lengthKey: nail.lengthKey,
      finger: nail.finger,
      unitPrice,
      available:
        availability.get(`${nail.productId}|${nail.shapeKey}|${nail.lengthKey}|${size}|${variationKey}`) ===
        true,
    };
  });
}

export async function replaceCompositionItems(
  client: pg.PoolClient,
  compositionId: string,
  nails: CompositionNailWrite[],
): Promise<void> {
  await client.query(`delete from cart_composition_items where composition_id = $1`, [compositionId]);
  for (const [index, nail] of nails.entries()) {
    await client.query(
      `insert into cart_composition_items
         (composition_id, position, product_id, shape_key, length_key, finger, variation_key)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        compositionId,
        index,
        nail.productId,
        nail.shapeKey,
        nail.lengthKey,
        nail.finger,
        nail.variationKey ?? '',
      ],
    );
  }
}

export async function insertCompositionIntoCart(
  client: pg.PoolClient,
  cartId: string,
  input: CompositionWriteInput,
  options: { keepUnavailable?: boolean } = {},
): Promise<string> {
  const resolved = await resolveWriteNails(client, input.size, input.nails);
  const validation = validateComposition(
    input.size,
    options.keepUnavailable ? resolved.map((nail) => ({ ...nail, available: true })) : resolved,
  );
  if (!validation.ok) throw new Error(validation.code);
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error('invalid_request');
  const id = randomUUID();
  await client.query(
    `insert into cart_compositions (id, cart_id, size, quantity, editing, comment)
     values ($1, $2, $3, $4, false, $5)`,
    [id, cartId, input.size, input.quantity, input.comment ?? null],
  );
  await replaceCompositionItems(client, id, input.nails);
  return id;
}

/** Error messages insertCompositionIntoCart throws for a set that cannot be
 * written as given (domain validation and resolveWriteNails). */
const COMPOSITION_COPY_REJECTIONS = new Set([
  'invalid_size',
  'empty',
  'too_many',
  'missing_finger',
  'invalid_finger',
  'duplicate_finger',
  'invalid_price',
  'unavailable',
  'invalid_composition_product',
  'price_missing',
  'invalid_request',
]);

/** Copies a set that was valid once (rebuy, guest-cart merge) into a cart
 * inside the caller's transaction. A set that can no longer be written
 * (hidden product, no price, malformed guest input) is skipped and reported
 * as false; it runs under a savepoint, so the skip never aborts the caller's
 * transaction. `keepUnavailable` keeps a set whose nails are only out of
 * stock: the cart then flags it like any set whose stock hit zero. */
export async function copyCompositionIntoCart(
  client: pg.PoolClient,
  cartId: string,
  input: CompositionWriteInput,
  options: { keepUnavailable?: boolean } = {},
): Promise<boolean> {
  await client.query('savepoint copy_composition');
  try {
    await insertCompositionIntoCart(client, cartId, input, options);
    await client.query('release savepoint copy_composition');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const pgCode = (error as { code?: unknown }).code;
    // 22xxx: data exceptions (a non-UUID product id from a guest payload).
    const rejected =
      COMPOSITION_COPY_REJECTIONS.has(message) || (typeof pgCode === 'string' && pgCode.startsWith('22'));
    if (!rejected) throw error;
    await client.query('rollback to savepoint copy_composition');
    return false;
  }
}
