import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { getHomeReviews } from '../application/vintedReviewsWorkflow.js';
import { isPluginEffectivelyEnabled } from '../../plugins/application/pluginStore.js';

export const vintedReviewsPublicRouter = Router();

/** A complete answer (reviews and rating) is kept by browsers for
 * HOME_REVIEWS_CACHE_TTL (`14d` on prod). Unset (dev, preprod), or an
 * incomplete answer: revalidated on every load (cheap 304 through the ETag),
 * so a value chosen later in the administration shows at once instead of an
 * empty answer being kept for days. */
function cacheControl(complete: boolean): string {
  const maxAgeMs = config.homeReviewsCacheMs;
  if (!complete || maxAgeMs === null) return 'no-cache';
  return `public, max-age=${Math.floor(maxAgeMs / 1000)}`;
}

vintedReviewsPublicRouter.get('/reviews', async (_req, res) => {
  if (!(await isPluginEffectivelyEnabled('commerce-reviews'))) {
    res.json({ success: true, reviews: [], rating: null });
    return;
  }
  const home = await getHomeReviews(pool);
  res.setHeader('Cache-Control', cacheControl(home.reviews.length > 0 && home.rating !== null));
  res.json({ success: true, ...home });
});
