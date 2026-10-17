import type pg from 'pg';
import { isUuid } from '../../../utils/validate.js';
import { getAvailabilityForSets, type SetAvailability } from './availability.js';
import { getLatestPricesForSets } from './prices.js';
import { dbPackPrices, dbPacks, publicPrice, type AccessoryType } from '../domain/accessoryPacks.js';
import type { PartialTrilingual } from '../../../types.js';
import { localize, type Language } from '../../../utils/language.js';
import { toPhotoUrl } from './photoUrl.js';
import { loadDefaultCopyResolver } from './productCopyResolution.js';

/**
 * Cart hydration by product id (nails and accessories). Split out of
 * products.ts, which re-exports it.
 */

export type ProductHydrationType = 'nail' | 'accessory';

/** Minimal product fields for cart hydration (nails + accessories). */
export interface ProductByIdResult {
  id: string;
  productType: ProductHydrationType;
  productUid: string;
  title: string;
  desc: string;
  price: number | Record<string, number> | undefined;
  photo: string | null;
  /** Shape→size map for nails; scalar remaining units for accessories. */
  available: SetAvailability | number;
  accessoryType?: AccessoryType;
  packs?: Record<string, number>;
  packLabels?: Record<string, string>;
  photosByPack?: Record<string, string[]>;
  inCartCarousel?: boolean;
}

/** Resolves product ids for cart hydration — returns both nails and
 * accessories (hidden included: a cart line may still reference a now-
 * hidden product). Missing ids are omitted, not errored. */
export async function getProductsByIds(
  client: pg.Pool,
  publicMediaUrl: string,
  ids: string[],
  language: Language,
  userId?: string,
): Promise<ProductByIdResult[]> {
  // A malformed id from the query string is simply not a product (it used to
  // reach the ::uuid cast and fail as a 500).
  const validIds = ids.filter(isUuid);
  if (validIds.length === 0) return [];

  const { rows } = await client.query<{
    id: string;
    product_type: ProductHydrationType;
    product_uid: string;
    title: PartialTrilingual;
    desc: PartialTrilingual;
    accessory_type: AccessoryType;
    accessory_packs: unknown;
    accessory_pack_prices: unknown;
    in_cart_carousel: boolean;
  }>(
    `select id, product_type, product_uid, title, "desc", accessory_type, accessory_packs, accessory_pack_prices, in_cart_carousel
     from products
     where id = any($1::uuid[])
       and (audience = 'public' or ($2::uuid is not null and exists (
         select 1 from product_user_library_users pulu where pulu.product_id = products.id and pulu.user_id = $2
       )))`,
    [validIds, userId ?? null],
  );
  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.id);
  // Five independent reads: one wait instead of five in a row.
  const [pricesBySet, availabilityBySet, { rows: photoRows }, { rows: quantityRows }, resolveCopy] =
    await Promise.all([
      getLatestPricesForSets(client, productIds),
      getAvailabilityForSets(client, productIds),
      client.query<{
        product_id: string;
        shape_key: string;
        small_path: string;
        position: number;
      }>(
        `select product_id, shape_key, small_path, "position"
       from product_photos
       where product_id = any($1::uuid[])
       order by product_id, shape_key, "position"`,
        [productIds],
      ),
      client.query<{ key: string; label: PartialTrilingual }>('select key, label from accessory_quantities'),
      loadDefaultCopyResolver(client, productIds),
    ]);
  const photosByProduct = new Map<string, Array<{ shapeKey: string; smallPath: string }>>();
  for (const row of photoRows) {
    const list = photosByProduct.get(row.product_id) ?? [];
    list.push({ shapeKey: row.shape_key, smallPath: row.small_path });
    photosByProduct.set(row.product_id, list);
  }

  const quantityLabels = new Map(quantityRows.map((row) => [row.key, row.label]));

  return rows.map((row) => {
    const availability = availabilityBySet.get(row.id) ?? {};
    const available: SetAvailability | number =
      row.product_type === 'accessory' ? (availability['']?.['']?.[''] ?? 0) : availability;
    const photos = photosByProduct.get(row.id) ?? [];
    const packs = dbPacks(row.accessory_packs);
    const packPrices = dbPackPrices(row.accessory_pack_prices);
    const accessoryType = row.product_type === 'accessory' ? row.accessory_type : undefined;
    const photosByPack: Record<string, string[]> = {};
    if (accessoryType === 'byQuantity') {
      for (const photo of photos) {
        if (!photo.shapeKey) continue;
        (photosByPack[photo.shapeKey] ??= []).push(toPhotoUrl(publicMediaUrl, photo.smallPath));
      }
    }
    const packLabels: Record<string, string> = {};
    if (accessoryType === 'byQuantity') {
      for (const key of Object.keys(packs)) {
        const entry = quantityLabels.get(key);
        packLabels[key] = (entry ? localize(entry, language) : '') || key;
      }
    }
    const firstPackKey = Object.keys(photosByPack).sort()[0];
    const photoPath =
      accessoryType === 'byQuantity'
        ? (photos.find((photo) => photo.shapeKey === firstPackKey)?.smallPath ?? photos[0]?.smallPath)
        : photos[0]?.smallPath;
    return {
      id: row.id,
      productType: row.product_type,
      productUid: row.product_uid,
      title: localize(row.title, language),
      desc: resolveCopy(row.id, row.desc, language),
      price: publicPrice(accessoryType ?? 'default', pricesBySet.get(row.id), packPrices),
      photo: photoPath ? toPhotoUrl(publicMediaUrl, photoPath) : null,
      available,
      ...(accessoryType ? { accessoryType, inCartCarousel: row.in_cart_carousel } : {}),
      ...(accessoryType === 'byQuantity' ? { packs, packLabels, photosByPack } : {}),
    };
  });
}
