import type pg from 'pg';
import { lineCommentOrNull } from '../../../utils/fieldLimits.js';
import { isCompositionFinger } from '../domain/composition.js';
import type { CompositionWriteInput } from '../application/compositionWrite.js';

/** No cart ever holds more than a handful; the cap only bounds a hostile body. */
const MAX_COMPOSITIONS_PER_REQUEST = 20;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Compositions arriving in a guest payload (login merge). Anything malformed
 * is dropped rather than refused: the rest of the guest's cart still has to
 * make it onto the account. The server re-prices and rechecks every nail
 * afterwards, so this only has to be shape-safe.
 */
export function parseGuestCompositions(raw: unknown): CompositionWriteInput[] {
  if (!Array.isArray(raw)) return [];
  const compositions: CompositionWriteInput[] = [];
  for (const entry of raw.slice(0, MAX_COMPOSITIONS_PER_REQUEST)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const size = typeof row.size === 'string' ? row.size : '';
    if (!size || !isPositiveInteger(row.quantity) || !Array.isArray(row.nails)) continue;
    const nails = row.nails.flatMap((nailRaw) => {
      if (!nailRaw || typeof nailRaw !== 'object') return [];
      const nail = nailRaw as Record<string, unknown>;
      const productId = typeof nail.productId === 'string' ? nail.productId : '';
      const shapeKey = typeof nail.shapeKey === 'string' ? nail.shapeKey : '';
      const lengthKey = typeof nail.lengthKey === 'string' ? nail.lengthKey : '';
      const finger = typeof nail.finger === 'string' ? nail.finger : '';
      const variationKey = typeof nail.variationKey === 'string' ? nail.variationKey : '';
      if (!productId || !shapeKey || !lengthKey || !isCompositionFinger(finger)) return [];
      return [{ productId, shapeKey, lengthKey, finger, variationKey }];
    });
    if (nails.length === 0) continue;
    // An invalid note is dropped with the rest of the stale state, never
    // the whole set.
    const comment = lineCommentOrNull(row.comment);
    compositions.push({ size, quantity: row.quantity, nails, ...(comment ? { comment } : {}) });
  }
  return compositions;
}

/**
 * The composed sets on a past order, in the shape "add this to a cart"
 * takes. Availability is deliberately not checked here: rebuy copies first,
 * then the cart rechecks every nail, exactly as it does for a set whose
 * stock has since hit zero.
 */
export async function readOrderCompositions(
  client: pg.Pool,
  orderId: string,
): Promise<CompositionWriteInput[]> {
  const { rows: parents } = await client.query<{
    id: string;
    size: string;
    quantity: number;
    comment: string | null;
  }>(
    `select id, size, quantity, comment from order_items
     where order_id = $1 and product_type = 'composition'`,
    [orderId],
  );
  if (parents.length === 0) return [];
  // Every set's nails in one read (it was one query per set).
  const { rows: nailRows } = await client.query<{
    order_item_id: string;
    product_id: string;
    shape_key: string;
    length_key: string;
    finger: string;
    variation_key: string;
  }>(
    `select order_item_id, product_id, shape_key, length_key, finger, variation_key
     from order_composition_items
     where order_item_id = any($1::uuid[]) and product_id is not null
     order by order_item_id, position`,
    [parents.map((parent) => parent.id)],
  );
  const nailsByParent = new Map<string, typeof nailRows>();
  for (const nail of nailRows) {
    const list = nailsByParent.get(nail.order_item_id) ?? [];
    list.push(nail);
    nailsByParent.set(nail.order_item_id, list);
  }
  const compositions: CompositionWriteInput[] = [];
  for (const parent of parents) {
    const nails = nailsByParent.get(parent.id) ?? [];
    if (nails.length === 0) continue;
    compositions.push({
      size: parent.size,
      quantity: parent.quantity,
      comment: parent.comment,
      nails: nails.map((nail) => ({
        productId: nail.product_id,
        shapeKey: nail.shape_key,
        lengthKey: nail.length_key,
        finger: nail.finger,
        variationKey: nail.variation_key,
      })),
    });
  }
  return compositions;
}
