/** Home-page customer reviews and rating (read from the shop's Vinted
 * profile). The administration calls live in `admin/vintedReviews.ts`, off
 * the entry bundle. Paths here are checked against the backend's real routes by
 * `npm run check:api`. */
import { requestJson as request } from './client';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  AdminShopRating,
  AdminVintedReview,
  AdminVintedReviewsList,
  HomeReview,
  HomeReviews,
  PublicReview,
  ShopRating,
  VintedRatingScrapeResult,
  VintedReviewCandidate,
  VintedScrapeResult,
} from './contract/reviews';

export type {
  AdminShopRating,
  AdminVintedReview,
  AdminVintedReviewsList,
  HomeReview,
  HomeReviews,
  PublicReview,
  ShopRating,
  VintedRatingScrapeResult,
  VintedReviewCandidate,
  VintedScrapeResult,
};

let homeReviewsInFlight: Promise<HomeReviews> | null = null;

/** The hero (rating) and the reviews block both need this on the same page
 * load: they share one request while it is in flight. */
export function fetchHomeReviews(): Promise<HomeReviews> {
  homeReviewsInFlight ??= request<{ success: true } & HomeReviews>('/reviews')
    .then(({ reviews, rating }) => ({ reviews, rating }))
    .finally(() => {
      homeReviewsInFlight = null;
    });
  return homeReviewsInFlight;
}
