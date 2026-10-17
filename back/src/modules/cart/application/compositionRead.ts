import type pg from 'pg';
import { config } from '../../../config/env.js';
import type {
  CartComposition,
  CartCompositionNail,
  CompositionFinger,
  Size,
} from '../../../contract/cart.js';
import type { PartialTrilingual } from '../../../types.js';
import { localize, type Language } from '../../../utils/language.js';
import { getNailVariantAvailabilityMap } from '../../catalog/application/availability.js';
import { getLatestPricesForSets } from '../../catalog/application/prices.js';
import { loadProductVariations, nailUnitPrice } from '../../catalog/application/productVariations.js';
import { toPhotoUrl } from '../../catalog/application/photoUrl.js';
import { compositionIsAvailable, compositionUnitPrice } from '../domain/composition.js';
import { queryTogether } from '../../../platform/db/queryTogether.js';
import { getActiveCart } from './cart.js';

type CompositionRow = {
  id: string;
  cart_id: string;
  size: Size;
  quantity: number;
  editing: boolean;
  comment?: string | null;
};

type CompositionItemRow = {
  composition_id: string;
  position: number;
  product_id: string;
  shape_key: string;
  length_key: string;
  finger: CompositionFinger;
  variation_key: string;
};

async function loadNailMeta(
  client: pg.Pool | pg.PoolClient,
  productIds: string[],
  language: Language,
): Promise<
  Map<
    string,
    {
      productUid: string;
      title: string;
      productType: string;
      shapes: Map<string, string>;
      lengths: Map<string, Map<string, string>>;
      /** shape → `length` or `length/variation` → first small photo. */
      photos: Map<string, Map<string, string>>;
    }
  >
> {
  const out = new Map();
  if (productIds.length === 0) return out;
  const { rows: products } = await client.query<{
    id: string;
    product_uid: string;
    product_type: string;
    title: PartialTrilingual;
  }>(`select id, product_uid, product_type, title from products where id = any($1::uuid[])`, [productIds]);
  const { rows: shapeRows } = await client.query<{
    product_id: string;
    shape_key: string;
    label: PartialTrilingual;
  }>(
    `select gss.product_id, gss.shape_key, s.label
     from product_shapes gss
     join shapes s on s.key = gss.shape_key
     where gss.product_id = any($1::uuid[])`,
    [productIds],
  );
  const { rows: lengthRows } = await client.query<{
    product_id: string;
    shape_key: string;
    length_key: string;
    label: PartialTrilingual;
  }>(
    `select gsl.product_id, gsl.shape_key, gsl.length_key, sl.label
     from product_shape_lengths gsl
     join shape_lengths sl on sl.shape_key = gsl.shape_key and sl.length_key = gsl.length_key
     where gsl.product_id = any($1::uuid[])`,
    [productIds],
  );
  const { rows: photoRows } = await client.query<{
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
  );

  for (const product of products) {
    out.set(product.id, {
      productUid: product.product_uid,
      title: localize(product.title, language),
      productType: product.product_type,
      shapes: new Map(),
      lengths: new Map(),
      photos: new Map(),
    });
  }
  for (const row of shapeRows) {
    out.get(row.product_id)?.shapes.set(row.shape_key, localize(row.label, language));
  }
  for (const row of lengthRows) {
    const entry = out.get(row.product_id);
    if (!entry) continue;
    const byShape = entry.lengths.get(row.shape_key) ?? new Map();
    byShape.set(row.length_key, localize(row.label, language));
    entry.lengths.set(row.shape_key, byShape);
  }
  for (const row of photoRows) {
    const entry = out.get(row.product_id);
    if (!entry) continue;
    const byShape = entry.photos.get(row.shape_key) ?? new Map();
    byShape.set(row.length_key, toPhotoUrl(config.publicMediaUrl, row.small_path));
    entry.photos.set(row.shape_key, byShape);
  }
  return out;
}

async function hydrateCompositions(
  client: pg.Pool | pg.PoolClient,
  rows: CompositionRow[],
  itemRows: CompositionItemRow[],
  language: Language,
): Promise<CartComposition[]> {
  const productIds = [...new Set(itemRows.map((row) => row.product_id))];
  const [meta, prices, variations, availability] = await queryTogether(client, [
    () => loadNailMeta(client, productIds, language),
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
  ]);

  const itemsByComposition = new Map<string, CompositionItemRow[]>();
  for (const item of itemRows) {
    const list = itemsByComposition.get(item.composition_id) ?? [];
    list.push(item);
    itemsByComposition.set(item.composition_id, list);
  }

  return rows.map((row) => {
    const children = (itemsByComposition.get(row.id) ?? []).sort((a, b) => a.position - b.position);
    const nails: CartCompositionNail[] = children.map((child) => {
      const product = meta.get(child.product_id);
      const productVariations = variations.get(child.product_id);
      const option = child.variation_key ? productVariations?.options.get(child.variation_key) : undefined;
      const unitPrice =
        nailUnitPrice(prices.get(child.product_id), productVariations, child.variation_key) ?? 0;
      const available =
        availability.get(
          `${child.product_id}|${child.shape_key}|${child.length_key}|${row.size}|${child.variation_key}`,
        ) === true;
      const photoKey = child.variation_key ? `${child.length_key}/${child.variation_key}` : child.length_key;
      return {
        productId: child.product_id,
        productUid: product?.productUid ?? '',
        // Each option is its own product: its title, not the nail's.
        title: option?.productTitle ? localize(option.productTitle, language) : (product?.title ?? ''),
        shapeKey: child.shape_key,
        lengthKey: child.length_key,
        shapeLabel: product?.shapes.get(child.shape_key) ?? child.shape_key,
        lengthLabel: product?.lengths.get(child.shape_key)?.get(child.length_key) ?? child.length_key,
        finger: child.finger,
        variationKey: child.variation_key,
        variationLabel: option ? localize(option.title, language) : '',
        variationAxisLabel:
          option && productVariations ? localize(productVariations.axisTitle, language) : '',
        photo: product?.photos.get(child.shape_key)?.get(photoKey) ?? null,
        unitPrice,
        available,
      };
    });
    const unitPrice = compositionUnitPrice(nails);
    return {
      id: row.id,
      size: row.size,
      quantity: row.quantity,
      editing: row.editing,
      unitPrice,
      available: compositionIsAvailable(nails),
      nails,
      ...(row.comment ? { comment: row.comment } : {}),
    };
  });
}

export async function listCompositionsForCart(
  pool: pg.Pool | pg.PoolClient,
  cartId: string,
  language: Language,
): Promise<CartComposition[]> {
  const { rows } = await pool.query<CompositionRow>(
    `select id, cart_id, size, quantity, editing, comment
     from cart_compositions where cart_id = $1 order by created_at asc`,
    [cartId],
  );
  if (rows.length === 0) return [];
  const { rows: itemRows } = await pool.query<CompositionItemRow>(
    `select composition_id, position, product_id, shape_key, length_key, finger, variation_key
     from cart_composition_items where composition_id = any($1::uuid[])
     order by composition_id, position`,
    [rows.map((row) => row.id)],
  );
  return hydrateCompositions(pool, rows, itemRows, language);
}

export async function listCompositionsForUser(
  pool: pg.Pool,
  userId: string,
  language: Language,
): Promise<CartComposition[]> {
  const cart = await getActiveCart(pool, userId);
  if (!cart) return [];
  return listCompositionsForCart(pool, cart.id, language);
}
