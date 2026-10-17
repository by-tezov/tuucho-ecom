/** Administration of the home-page Vinted reviews and rating. Kept apart
 * from `../vintedReviews.ts`, which the home page (entry bundle) loads. */
import { authHeaders, requestJson as request } from '../client';
import type {
  AdminShopRating,
  AdminVintedReview,
  AdminVintedReviewsList,
  FeatureVintedReviewsResult,
  VintedRatingScrapeResult,
  VintedReviewCandidate,
  VintedScrapeResult,
} from '../contract/reviews';

export function getAdminVintedReviews(
  accessToken: string,
): Promise<{ success: true } & AdminVintedReviewsList> {
  return request('/admin/vinted-reviews', { headers: authHeaders(accessToken) });
}

export function scrapeAdminVintedReviews(
  accessToken: string,
  profileUrl: string,
  count: number,
): Promise<{ success: true } & VintedScrapeResult> {
  return request('/admin/vinted-reviews/scrape', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ profileUrl, count }),
  });
}

/** Adds the reviewer's public location to one scraped candidate. */
export function locateAdminVintedCandidate(
  accessToken: string,
  profileUrl: string,
  token: string,
): Promise<{ success: true; candidate: VintedReviewCandidate }> {
  return request('/admin/vinted-reviews/locate', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ profileUrl, token }),
  });
}

/** `tokens`: the chosen candidates' server signatures from the scrape. */
export function featureAdminVintedReviews(
  accessToken: string,
  tokens: string[],
): Promise<{ success: true } & FeatureVintedReviewsResult> {
  return request('/admin/vinted-reviews/featured', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ tokens }),
  });
}

/** Translates one review shown on the home page into one language. */
export function translateAdminVintedReview(
  accessToken: string,
  feedbackId: string,
  lang: string,
): Promise<{ success: true; review: AdminVintedReview }> {
  return request(`/admin/vinted-reviews/featured/${encodeURIComponent(feedbackId)}/translate`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ lang }),
  });
}

export function unfeatureAdminVintedReview(
  accessToken: string,
  feedbackId: string,
): Promise<{ success: true }> {
  return request(`/admin/vinted-reviews/featured/${encodeURIComponent(feedbackId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function scrapeAdminVintedRating(
  accessToken: string,
  profileUrl: string,
): Promise<{ success: true } & VintedRatingScrapeResult> {
  return request('/admin/vinted-reviews/rating/scrape', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ profileUrl }),
  });
}

/** `token`: the scraped rating's server signature. */
export function applyAdminVintedRating(
  accessToken: string,
  token: string,
): Promise<{ success: true; rating: AdminShopRating }> {
  return request('/admin/vinted-reviews/rating', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ token }),
  });
}
