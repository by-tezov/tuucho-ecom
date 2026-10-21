import { Router } from 'express';
import { pool } from '../../../../db/pool.js';
import { requireAuth } from '../../../../middleware/requireAuth.js';
import * as favorites from '../infrastructure/favoritesStore.js';
import { defaultLengthFor, userCanAccessProduct } from '../../../catalog/application/productCartQueries.js';
import { isNonEmptyString } from '../../../../utils/validate.js';

export const accountFavoritesRouter = Router();

function toPublicFavorite(row: favorites.FavoriteRow) {
  return {
    productId: row.product_id,
    shapeKey: row.shape_key,
    lengthKey: row.length_key,
    variationKey: row.variation_key ?? '',
  };
}

accountFavoritesRouter.get('/favorites', requireAuth, async (req, res) => {
  const rows = await favorites.listForUser(pool, req.user!.id);
  res.json({ success: true, favorites: rows.map(toPublicFavorite) });
});

/** Upsert — also how GalleryCard.tsx's shape-tab switch on an already-
 * favorited item persists the newly active shape. */
accountFavoritesRouter.post('/favorites', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const productId = isNonEmptyString(body.productId) ? body.productId : undefined;
  const shapeKey = isNonEmptyString(body.shapeKey) ? body.shapeKey : undefined;
  if (!productId || !shapeKey) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (!(await userCanAccessProduct(pool, req.user!.id, productId))) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const lengthKey = isNonEmptyString(body.lengthKey)
    ? body.lengthKey
    : await defaultLengthFor(pool, productId, shapeKey);

  try {
    // A display preference only (which option the heart remembers), never an
    // offer check, so an unknown key is harmless and stored as sent.
    const variationKey = typeof body.variationKey === 'string' ? body.variationKey.slice(0, 64) : '';
    await favorites.upsert(pool, req.user!.id, productId, shapeKey, lengthKey, variationKey);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23503') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    throw error;
  }
  res.json({ success: true });
});

accountFavoritesRouter.delete('/favorites/:productId', requireAuth, async (req, res) => {
  const { productId } = req.params as { productId: string };
  const deleted = await favorites.remove(pool, req.user!.id, productId);
  res.json({ success: true, deleted });
});
