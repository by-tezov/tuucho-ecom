import { Router } from 'express';
import { pluginSettingDurationMsOrNull } from '@kernel/back/modules/plugins/application/pluginSettingValues';
import { pool } from '@kernel/back/db/pool';
import { getHomeReviews } from '../application/vintedReviewsWorkflow.js';
import { isPluginEffectivelyEnabled } from '@kernel/back/modules/plugins/application/pluginStore';

export const vintedReviewsPublicRouter = Router();

/** A complete answer (reviews and rating) is kept by browsers for
 * HOME_REVIEWS_CACHE_TTL (`14d` on prod). Unset (dev, preprod), or an
 * incomplete answer: revalidated on every load (cheap 304 through the ETag),
 * so a value chosen later in the administration shows at once instead of an
 * empty answer being kept for days. */
function cacheControl(complete: boolean): string {
  const maxAgeMs = pluginSettingDurationMsOrNull('tuucho-commerce-vinted-review', 'homeCacheTtl');
  if (!complete || maxAgeMs === null) return 'no-cache';
  return `public, max-age=${Math.floor(maxAgeMs / 1000)}`;
}

vintedReviewsPublicRouter.get('/reviews', async (_req, res) => {
  if (!(await isPluginEffectivelyEnabled('tuucho-commerce-vinted-review'))) {
    res.json({ success: true, reviews: [], rating: null });
    return;
  }
  const home = await getHomeReviews(pool);
  res.setHeader('Cache-Control', cacheControl(home.reviews.length > 0 && home.rating !== null));
  res.json({ success: true, ...home });
});
