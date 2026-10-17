import type pg from 'pg';
import type { GalleryItem } from '../../../types.js';
import type { Language } from '../../../utils/language.js';
import type { GalleryFeedParams } from './feedWhere.js';
import { assembleItems, listGalleryFeed, type GalleryFeedResult, type SetRow } from './products.js';

/** Gallery of single-nail designs for compose-a-set. Same feed shape as
 * catalogue sets; `available` uses 1 = offered (boolean table underneath). */
export async function listNailGalleryFeed(
  client: pg.Pool,
  publicMediaUrl: string,
  params: GalleryFeedParams,
  language: Language,
): Promise<GalleryFeedResult> {
  return listGalleryFeed(
    client,
    publicMediaUrl,
    { ...params, productType: 'nail_single', userLibraryOnly: false },
    language,
  );
}

/** One public nail_single by product_uid, opened on `variation` when it is
 * one of its options (the item then describes that option, see
 * assembleItems). An unknown `variation` opens the first option. */
export async function getNailProductByUid(
  client: pg.Pool,
  publicMediaUrl: string,
  productUid: string,
  language: Language,
  variation?: string,
): Promise<GalleryItem | undefined> {
  const { rows } = await client.query<SetRow>(
    `select id, product_uid, title, "desc", occasion, alt, featured_from, featured_for, created_at, audience
     from products
     where hidden = false and product_type = 'nail_single' and audience = 'public'
       and upper(product_uid) = upper($1)
     limit 1`,
    [productUid],
  );
  if (rows.length === 0) return undefined;
  const initialVariation = variation ? new Map([[rows[0]!.id, variation]]) : undefined;
  const [item] = await assembleItems(client, rows, publicMediaUrl, language, 'boolean', { initialVariation });
  return item;
}
