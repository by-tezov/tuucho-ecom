import type pg from 'pg';
import { queryTogether } from '../../../platform/db/queryTogether.js';
import { isUuid } from '../../../utils/validate.js';
import type { Size } from '../../../contract/cart.js';
import type { PartialTrilingual } from '../../../types.js';
import { getNailVariantAvailabilityMap } from '../../catalog/application/availability.js';
import { getLatestPricesForSets } from '../../catalog/application/prices.js';
import { loadProductVariations, nailUnitPrice } from '../../catalog/application/productVariations.js';
import {
  compositionIsAvailable,
  compositionUnitPrice,
  validateComposition,
  type CompositionNailInput,
} from '../domain/composition.js';

export type CheckoutCompositionNail = {
  product_id: string;
  product_uid: string;
  title: PartialTrilingual;
  shape_key: string;
  length_key: string;
  shape_label: PartialTrilingual | null;
  length_label: PartialTrilingual | null;
  finger: string;
  /** `''` for a nail without variations. Labels are snapshotted on the order. */
  variation_key: string;
  variation_label: PartialTrilingual | null;
  variation_axis_label: PartialTrilingual | null;
  photo_path: string | null;
  unit_price: number;
  position: number;
  available: boolean;
};

export type CheckoutComposition = {
  id: string;
  size: Size;
  quantity: number;
  editing: boolean;
  available: boolean;
  unitPrice: number;
  nails: CheckoutCompositionNail[];
  comment: string | null;
};

export type GuestCompositionInput = {
  id?: string;
  size: string;
  quantity: number;
  editing?: boolean;
  comment?: string | null;
  nails: Array<{
    productId: string;
    shapeKey: string;
    lengthKey: string;
    finger: string;
    variationKey?: string;
  }>;
};

async function hydrateCheckoutCompositions(
  client: pg.Pool | pg.PoolClient,
  rows: Array<{ id: string; size: Size; quantity: number; editing: boolean; comment: string | null }>,
  itemRows: Array<{
    composition_id: string;
    position: number;
    product_id: string;
    shape_key: string;
    length_key: string;
    finger: string;
    variation_key: string;
  }>,
): Promise<CheckoutComposition[]> {
  const productIds = [...new Set(itemRows.map((row) => row.product_id))];
  if (rows.length === 0) return [];

  const [prices, variations, availability, products, shapeLabels, lengthLabels, photos] = await queryTogether(
    client,
    [
      () => getLatestPricesForSets(client, productIds),
      () => loadProductVariations(client, productIds),
      () =>
        getNailVariantAvailabilityMap(
          client,
          itemRows.map((row) => {
            const parent = rows.find((composition) => composition.id === row.composition_id);
            return {
              productId: row.product_id,
              shapeKey: row.shape_key,
              lengthKey: row.length_key,
              size: parent?.size ?? 'M',
              variationKey: row.variation_key,
            };
          }),
        ),
      () =>
        client.query<{ id: string; product_uid: string; title: PartialTrilingual; product_type: string }>(
          `select id, product_uid, title, product_type from products where id = any($1::uuid[])`,
          [productIds],
        ),
      () =>
        client.query<{ key: string; label: PartialTrilingual }>(
          `select key, label from shapes where key = any($1::text[])`,
          [[...new Set(itemRows.map((row) => row.shape_key))]],
        ),
      () =>
        client.query<{ shape_key: string; length_key: string; label: PartialTrilingual }>(
          `select shape_key, length_key, label from shape_lengths
       where (shape_key, length_key) in (
         select * from unnest($1::text[], $2::text[])
       )`,
          [itemRows.map((row) => row.shape_key), itemRows.map((row) => row.length_key)],
        ),
      () =>
        client.query<{
          product_id: string;
          shape_key: string;
          length_key: string;
          small_path: string;
        }>(
          `select distinct on (product_id, shape_key, length_key, variation_key)
              product_id, shape_key,
              case when variation_key = '' then length_key else length_key || '/' || variation_key end as length_key,
              small_path
       from product_photos
       where product_id = any($1::uuid[])
       order by product_id, shape_key, length_key, variation_key, "position"`,
          [productIds],
        ),
    ],
  );

  const productById = new Map(products.rows.map((row) => [row.id, row]));
  const shapeLabelByKey = new Map(shapeLabels.rows.map((row) => [row.key, row.label]));
  const lengthLabelByKey = new Map(
    lengthLabels.rows.map((row) => [`${row.shape_key}|${row.length_key}`, row.label]),
  );
  const photoByKey = new Map(
    photos.rows.map((row) => [`${row.product_id}|${row.shape_key}|${row.length_key}`, row.small_path]),
  );

  const itemsByComposition = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByComposition.get(item.composition_id) ?? [];
    list.push(item);
    itemsByComposition.set(item.composition_id, list);
  }

  return rows.map((row) => {
    const children = (itemsByComposition.get(row.id) ?? []).sort((a, b) => a.position - b.position);
    const nails: CheckoutCompositionNail[] = children.map((child) => {
      const product = productById.get(child.product_id);
      const productVariations = variations.get(child.product_id);
      const option = child.variation_key ? productVariations?.options.get(child.variation_key) : undefined;
      const resolvedPrice = nailUnitPrice(prices.get(child.product_id), productVariations, child.variation_key);
      const unitPrice = resolvedPrice ?? 0;
      // A nail with no price cannot be sold: it reads as unavailable, so
      // checkout refuses or drops the set instead of charging it at 0.
      const available =
        resolvedPrice !== undefined &&
        availability.get(
          `${child.product_id}|${child.shape_key}|${child.length_key}|${row.size}|${child.variation_key}`,
        ) === true;
      const photoLength = child.variation_key
        ? `${child.length_key}/${child.variation_key}`
        : child.length_key;
      return {
        product_id: child.product_id,
        product_uid: product?.product_uid ?? '',
        // Snapshotted into the order: the option's own title when it has one.
        title: option?.productTitle ?? product?.title ?? { fr: '' },
        shape_key: child.shape_key,
        length_key: child.length_key,
        shape_label: shapeLabelByKey.get(child.shape_key) ?? null,
        length_label: lengthLabelByKey.get(`${child.shape_key}|${child.length_key}`) ?? null,
        finger: child.finger,
        variation_key: child.variation_key,
        variation_label: option?.title ?? null,
        variation_axis_label: option && productVariations ? productVariations.axisTitle : null,
        photo_path: photoByKey.get(`${child.product_id}|${child.shape_key}|${photoLength}`) ?? null,
        unit_price: unitPrice,
        position: child.position,
        available,
      };
    });
    return {
      id: row.id,
      size: row.size,
      quantity: row.quantity,
      editing: row.editing,
      unitPrice: compositionUnitPrice(nails.map((nail) => ({ unitPrice: nail.unit_price }))),
      available: compositionIsAvailable(nails),
      nails,
      comment: row.comment,
    };
  });
}

export async function loadCompositionsForCheckout(
  client: pg.Pool | pg.PoolClient,
  cartId: string,
): Promise<CheckoutComposition[]> {
  const { rows } = await client.query<{
    id: string;
    size: Size;
    quantity: number;
    editing: boolean;
    comment: string | null;
  }>(
    `select id, size, quantity, editing, comment from cart_compositions
     where cart_id = $1 order by created_at asc`,
    [cartId],
  );
  if (rows.length === 0) return [];
  const { rows: itemRows } = await client.query<{
    composition_id: string;
    position: number;
    product_id: string;
    shape_key: string;
    length_key: string;
    finger: string;
    variation_key: string;
  }>(
    `select composition_id, position, product_id, shape_key, length_key, finger, variation_key
     from cart_composition_items where composition_id = any($1::uuid[])
     order by composition_id, position`,
    [rows.map((row) => row.id)],
  );
  return hydrateCheckoutCompositions(client, rows, itemRows);
}

/** Resolve guest-submitted compositions against live catalogue prices and
 * boolean availability. Invalid nails fail the whole checkout. */
export async function resolveGuestCompositionsForCheckout(
  client: pg.Pool | pg.PoolClient,
  inputs: GuestCompositionInput[],
): Promise<
  | { ok: true; compositions: CheckoutComposition[] }
  | { ok: false; reason: 'price_missing' | 'size_unavailable' | 'composition_editing' }
> {
  if (inputs.some((input) => input.editing === true)) {
    return { ok: false, reason: 'composition_editing' };
  }
  if (inputs.length === 0) return { ok: true, compositions: [] };
  // A malformed product id is a set that cannot be priced, same answer as an
  // unknown product (it used to reach the ::uuid cast and fail as a 500).
  if (inputs.some((input) => input.nails.some((nail) => !isUuid(nail.productId)))) {
    return { ok: false, reason: 'price_missing' };
  }

  // Every lookup batched across all sets: a price preview used to run five
  // queries per set, then hydrate each set on its own.
  const productIds = [...new Set(inputs.flatMap((input) => input.nails.map((nail) => nail.productId)))];
  const [{ rows: products }, prices, variations] = await queryTogether(client, [
    () =>
      client.query<{ id: string; product_type: string }>(
        `select id, product_type from products where id = any($1::uuid[]) and hidden = false and audience = 'public'`,
        [productIds],
      ),
    () => getLatestPricesForSets(client, productIds),
    () => loadProductVariations(client, productIds),
  ]);
  const productTypeById = new Map(products.map((row) => [row.id, row.product_type]));

  const keys = inputs.map((_input, index) => `guest-composition-${index}`);
  for (const input of inputs) {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
      return { ok: false, reason: 'price_missing' };
    }
    const resolved: CompositionNailInput[] = [];
    for (const nail of input.nails) {
      if (productTypeById.get(nail.productId) !== 'nail_single') return { ok: false, reason: 'price_missing' };
      const unitPrice = nailUnitPrice(
        prices.get(nail.productId),
        variations.get(nail.productId),
        nail.variationKey ?? '',
      );
      if (unitPrice === undefined) return { ok: false, reason: 'price_missing' };
      // Availability is judged on the hydrated set below; here only the shape.
      resolved.push({ ...nail, unitPrice, available: true });
    }
    const validation = validateComposition(input.size, resolved);
    if (!validation.ok) return { ok: false, reason: 'price_missing' };
  }

  const hydrated = await hydrateCheckoutCompositions(
    client,
    inputs.map((input, index) => ({
      id: keys[index]!,
      size: input.size as Size,
      quantity: input.quantity,
      editing: false,
      comment: input.comment ?? null,
    })),
    inputs.flatMap((input, index) =>
      input.nails.map((nail, position) => ({
        composition_id: keys[index]!,
        position,
        product_id: nail.productId,
        shape_key: nail.shapeKey,
        length_key: nail.lengthKey,
        finger: nail.finger,
        variation_key: nail.variationKey ?? '',
      })),
    ),
  );
  const compositions: CheckoutComposition[] = [];
  for (const [index, input] of inputs.entries()) {
    const composition = hydrated[index];
    if (!composition) return { ok: false, reason: 'price_missing' };
    // An out-of-stock nail is a stock answer, not a pricing one.
    if (!composition.available) return { ok: false, reason: 'size_unavailable' };
    compositions.push({ ...composition, id: input.id ?? keys[index]! });
  }
  return { ok: true, compositions };
}
