/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/reviews.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */

/** A buyer review read from the shop's Vinted profile (`GET /reviews`). */
export interface PublicReview {
  /** Vinted feedback id. */
  id: string;
  text: string;
  rating: number;
  /** Reviewer's public Vinted login. */
  author: string;
  city: string | null;
  countryCode: string | null;
  reviewedAt: string;
}

/** A review shown on the home page, with its machine translations. */
export interface HomeReview extends PublicReview {
  /** The review's own language (site code such as `fr`): the language of
   * the Vinted storefront it was read from; null when the site does not offer
   * it. */
  sourceLang: string | null;
  /** Site language code to machine translation (MyMemory); empty until
   * translated. The source language has no entry: `text` is the original. */
  translations: Partial<Record<string, string>>;
}

/** A review shown on the home page, as the administration lists it. */
export interface AdminVintedReview extends HomeReview {
  /** When it was chosen; the newest is shown first. */
  featuredAt: string;
}

export interface AdminVintedReviewsList {
  featured: AdminVintedReview[];
  rating: AdminShopRating | null;
}

/** A scraped review. Not stored: `token` is the server's signature over it,
 * sent back to `POST /admin/vinted-reviews/featured` to store it. A fresh
 * scrape has no location yet: `POST /admin/vinted-reviews/locate` adds it. */
export interface VintedReviewCandidate extends PublicReview {
  token: string;
}

export interface VintedScrapeResult {
  /** Vinted's order (newest first), automatic feedback removed. Reviews
   * already on the home page are included. */
  candidates: VintedReviewCandidate[];
  /** Fewer real reviews than asked were found (no more on the profile, the
   * page cap, or the time limit). */
  exhausted: boolean;
  automaticDiscarded: number;
}

/** The shop's Vinted star rating shown in the home page hero. */
export interface ShopRating {
  /** One decimal, as Vinted shows it: "4.9". */
  rating: string;
  reviewCount: number;
}

/** `GET /reviews`: chosen reviews and the applied rating (null until one is applied). */
export interface HomeReviews {
  reviews: HomeReview[];
  rating: ShopRating | null;
}

export interface AdminShopRating extends ShopRating {
  updatedAt: string;
}

/** A freshly scraped rating, not stored. `token` applies it. */
export interface VintedRatingScrapeResult {
  scraped: ShopRating & { token: string };
  current: AdminShopRating | null;
}

/** `POST /admin/vinted-reviews/featured`. */
export interface FeatureVintedReviewsResult {
  featured: AdminVintedReview[];
  /** Chosen reviews without a translation yet: translate each with
   * `POST /admin/vinted-reviews/featured/:feedbackId/translate`. */
  untranslated: string[];
}
