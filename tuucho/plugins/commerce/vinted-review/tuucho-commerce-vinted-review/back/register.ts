import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { vintedReviewsAdminRouter } from './src/http/vintedReviewsAdmin.router.js';
import { vintedReviewsPublicRouter } from './src/http/vintedReviewsPublic.router.js';
import { getHomeReviews } from './src/application/vintedReviewsWorkflow.js';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, {
    listFeatured: getHomeReviews,
    listPublic: getHomeReviews,
  });
  api.registerHttpMount({ scope: 'admin', path: '/vinted-reviews', router: vintedReviewsAdminRouter });
  api.registerHttpMount({ scope: 'public', path: '/', router: vintedReviewsPublicRouter });
  api.addFilter(CORE_OPENING_FILTERS.seoJsonLd, async (graph: unknown[]) => {
    const { pool } = await import('@kernel/back/db/pool');
    const home = await getHomeReviews(pool).catch(() => ({ reviews: [] as unknown[], rating: null }));
    if (!home.reviews.length) return graph;
    return [
      ...graph,
      {
        '@type': 'AggregateRating',
        ratingValue: home.rating?.rating ?? '5',
        reviewCount: String(home.reviews.length),
      },
    ];
  });
};

export { register };
export default register;
