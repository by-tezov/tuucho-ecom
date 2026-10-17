/** Workflow and transaction orchestration for vinted-reviews.
 *
 * A scrape only reads Vinted and stores nothing: each candidate goes back to
 * the admin page with a server signature (`token`). Choosing reviews sends
 * the tokens back; only verified, chosen reviews are stored, three at most.
 * The whole scrape is bounded by a deadline: an admin request never waits on
 * Vinted for longer than that. */
import jwt from 'jsonwebtoken';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import type {
  AdminShopRating,
  AdminVintedReview,
  AdminVintedReviewsList,
  FeatureVintedReviewsResult,
  HomeReviews,
  ShopRating,
  VintedRatingScrapeResult,
  VintedReviewCandidate,
  VintedScrapeResult,
} from '../../../contract/reviews.js';
import { withTransaction } from '../../../platform/db/transaction.js';
import {
  FEATURED_REVIEWS_MAX,
  REVIEW_TEXT_MAX,
  cleanTranslations,
  isReviewLang,
  myMemoryCode,
  nextFeaturedIds,
  parseMemberLocation,
  splitForTranslation,
  storefrontLang,
  parseShopRating,
  toRealFeedback,
  type MemberLocation,
  type RealFeedback,
  type ReviewLang,
  type VintedProfile,
} from '../domain/vintedReviewsRules.js';
import {
  VintedUnavailableError,
  fetchVintedFeedbackPage,
  fetchVintedMemberPage,
  openVintedSession,
  type VintedSession,
} from '../infrastructure/vintedClient.js';
import { TranslationUnavailableError, myMemoryTranslate } from '../infrastructure/myMemoryClient.js';
import {
  deleteVintedReview,
  getVintedRating,
  getVintedReviewSource,
  setVintedReviewTranslation,
  listFeaturedVintedReviews,
  setVintedRating,
  type VintedRatingRow,
  lockFeaturedVintedReviews,
  setFeaturedVintedReviews,
  upsertVintedReviews,
  type VintedReviewInsert,
  type VintedReviewRow,
} from '../infrastructure/vintedReviewsStore.js';

export { VintedUnavailableError } from '../infrastructure/vintedClient.js';
export { TranslationUnavailableError } from '../infrastructure/myMemoryClient.js';

/** The whole scrape, every Vinted call included. Shorter than the front's
 * 30 s request timeout so the admin always gets an answer from the server.
 * Reaching it while reading locations is not an error: the reviews found so
 * far are kept and the remaining locations stay empty. */
const SCRAPE_DEADLINE_MS = 25_000;
const FEEDBACK_PER_PAGE = 20;
/** Automatic feedback can dominate a page; past this many pages the scrape
 * stops even if fewer real reviews than asked were found. Kept low: the
 * client paces requests a second or two apart (see vintedClient.ts). */
const FEEDBACK_MAX_PAGES = 6;
/** A candidate can be chosen for this long after its scrape. */
const CANDIDATE_TOKEN_TTL = '24h';
/** Distinct from access tokens and from each other, so no token can stand
 * in for another kind. */
const CANDIDATE_TOKEN_AUDIENCE = 'pamsurin-vinted-review';
const RATING_TOKEN_AUDIENCE = 'pamsurin-vinted-rating';

function signScraped(payload: object, audience: string): string {
  return jwt.sign(payload, config.jwt.secret, {
    algorithm: 'HS256',
    audience,
    expiresIn: CANDIDATE_TOKEN_TTL,
  });
}

/** The payload exactly as this server signed it, or an error. */
function verifyScraped(token: string, audience: string): Record<string, unknown> {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'], audience });
    if (decoded && typeof decoded === 'object') return decoded as Record<string, unknown>;
  } catch {
    // Falls through to the same refusal as a malformed payload.
  }
  throw new InvalidCandidateTokenError();
}

export class ScrapeInProgressError extends Error {
  constructor() {
    super('scrape_in_progress');
  }
}

export class ScrapeTimeoutError extends Error {
  constructor() {
    super('vinted_timeout');
  }
}

export type VintedReview = AdminVintedReview;

function toReview(row: VintedReviewRow): VintedReview {
  return {
    id: row.feedback_id,
    text: row.review_text,
    rating: row.rating,
    author: row.author_login,
    city: row.city,
    countryCode: row.country_code ? row.country_code.trim() : null,
    reviewedAt: new Date(row.reviewed_at).toISOString(),
    featuredAt: new Date(row.featured_at ?? row.scraped_at).toISOString(),
    sourceLang: row.source_lang,
    translations: cleanTranslations(row.translations),
  };
}

function signCandidate(review: VintedReviewInsert): VintedReviewCandidate {
  const token = signScraped({ review }, CANDIDATE_TOKEN_AUDIENCE);
  return {
    id: review.feedbackId,
    text: review.text,
    rating: review.rating,
    author: review.authorLogin,
    city: review.city,
    countryCode: review.countryCode,
    reviewedAt: review.reviewedAt,
    token,
  };
}

export class InvalidCandidateTokenError extends Error {
  constructor() {
    super('invalid_review_token');
  }
}

function isString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

/** The review exactly as this server scraped and signed it, or an error. */
function verifyCandidate(token: string): VintedReviewInsert {
  const review = verifyScraped(token, CANDIDATE_TOKEN_AUDIENCE).review as Record<string, unknown> | undefined;
  if (
    !review ||
    !isString(review.feedbackId, 19) ||
    !isString(review.authorVintedId, 19) ||
    !isString(review.authorLogin, 80) ||
    !isString(review.text, REVIEW_TEXT_MAX) ||
    typeof review.rating !== 'number' ||
    !isString(review.reviewedAt, 40) ||
    !(review.city === null || isString(review.city, 120)) ||
    !(review.countryCode === null || isString(review.countryCode, 2))
  ) {
    throw new InvalidCandidateTokenError();
  }
  // A token signed before source languages existed has none: unknown.
  const sourceLang = isReviewLang(review.sourceLang) ? review.sourceLang : null;
  return { ...(review as unknown as VintedReviewInsert), sourceLang };
}

export async function listFeaturedReviews(pool: pg.Pool): Promise<VintedReview[]> {
  return (await listFeaturedVintedReviews(pool, FEATURED_REVIEWS_MAX)).map(toReview);
}

function toRating(row: VintedRatingRow): AdminShopRating {
  return {
    rating: Number(row.rating).toFixed(1),
    reviewCount: row.review_count,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function currentRating(pool: pg.Pool): Promise<AdminShopRating | null> {
  const row = await getVintedRating(pool);
  return row ? toRating(row) : null;
}

export async function getHomeReviews(pool: pg.Pool): Promise<HomeReviews> {
  const [reviews, rating] = await Promise.all([listFeaturedReviews(pool), currentRating(pool)]);
  return {
    reviews: reviews.map(({ featuredAt: _featuredAt, ...review }) => review),
    rating: rating ? { rating: rating.rating, reviewCount: rating.reviewCount } : null,
  };
}

export async function listAdminVintedReviews(pool: pg.Pool): Promise<AdminVintedReviewsList> {
  const [featured, rating] = await Promise.all([listFeaturedReviews(pool), currentRating(pool)]);
  return { featured, rating };
}

export type ScrapeResult = VintedScrapeResult;

/** One scrape at a time per process: a double click must not double the
 * traffic sent to Vinted. */
let scrapeRunning = false;

/** Reads feedback pages until `count` real reviews are found. Reaching the
 * deadline after the first page keeps what was found so far. */
async function collectRealFeedback(
  session: VintedSession,
  memberId: string,
  count: number,
  signal: AbortSignal,
): Promise<{ real: RealFeedback[]; automatic: number; exhausted: boolean }> {
  const real: RealFeedback[] = [];
  const seen = new Set<string>();
  let automatic = 0;
  for (let page = 1; page <= FEEDBACK_MAX_PAGES; page += 1) {
    let result: Awaited<ReturnType<typeof fetchVintedFeedbackPage>>;
    try {
      result = await fetchVintedFeedbackPage(session, memberId, page, FEEDBACK_PER_PAGE, signal);
    } catch (error) {
      if (signal.aborted && page > 1) break;
      throw error;
    }
    for (const feedback of result.feedbacks) {
      const parsed = toRealFeedback(feedback);
      if (!parsed) {
        automatic += 1;
        continue;
      }
      if (seen.has(parsed.feedbackId)) continue;
      seen.add(parsed.feedbackId);
      real.push(parsed);
      if (real.length >= count) return { real, automatic, exhausted: false };
    }
    if (page >= result.totalPages || result.feedbacks.length === 0) break;
  }
  return { real, automatic, exhausted: true };
}

export async function scrapeVintedReviews(profile: VintedProfile, count: number): Promise<ScrapeResult> {
  if (scrapeRunning) throw new ScrapeInProgressError();
  scrapeRunning = true;
  const deadline = AbortSignal.timeout(SCRAPE_DEADLINE_MS);
  try {
    let collected: Awaited<ReturnType<typeof collectRealFeedback>>;
    try {
      const session = await openVintedSession(profile, deadline);
      collected = await collectRealFeedback(session, profile.memberId, count, deadline);
    } catch (error) {
      if (deadline.aborted) throw new ScrapeTimeoutError();
      throw error;
    }
    // Locations come later, one member page per `locateVintedCandidate`
    // call, so this request stays short and the pace stays slow.
    const rows: VintedReviewInsert[] = collected.real.map((review) => ({
      feedbackId: review.feedbackId,
      authorVintedId: review.authorVintedId,
      authorLogin: review.authorLogin,
      text: review.text,
      rating: review.rating,
      reviewedAt: review.reviewedAt,
      city: null,
      countryCode: null,
      sourceLang: storefrontLang(profile.origin),
    }));
    // Every buyer-written review, in Vinted's order, including those already
    // on the home page (the admin page marks them).
    return {
      candidates: rows.map(signCandidate),
      exhausted: collected.exhausted,
      automaticDiscarded: collected.automatic,
    };
  } finally {
    scrapeRunning = false;
  }
}

/** Adds the reviewer's public location to one candidate (one member page),
 * re-signed so the location is as trusted as the review. A failure leaves the
 * candidate without location; the caller decides whether to go on. */
export async function locateVintedCandidate(
  profile: VintedProfile,
  token: string,
): Promise<VintedReviewCandidate> {
  const review = verifyCandidate(token);
  const deadline = AbortSignal.timeout(SCRAPE_DEADLINE_MS);
  let location: MemberLocation;
  try {
    const session = await openVintedSession(profile, deadline);
    const html = await fetchVintedMemberPage(
      session,
      review.authorVintedId,
      deadline,
      `${profile.origin}/member/${profile.memberId}?tab=feedback`,
    );
    location = parseMemberLocation(html, review.authorVintedId);
  } catch (error) {
    if (deadline.aborted) throw new ScrapeTimeoutError();
    throw error;
  }
  return signCandidate({ ...review, city: location.city, countryCode: location.countryCode });
}

export class DuplicateReviewError extends Error {
  constructor() {
    super('invalid_request');
  }
}

/** One language of one review is one paced request per piece (see
 * myMemoryClient.ts); this bounds the admin request, under the front's 30 s
 * request timeout. */
const TRANSLATE_DEADLINE_MS = 25_000;

export class SameLanguageError extends Error {
  constructor() {
    super('invalid_request');
  }
}

/** The text into one site language through MyMemory. */
async function translateText(text: string, sourceLang: string | null, lang: ReviewLang): Promise<string> {
  if (!isReviewLang(sourceLang)) throw new TranslationUnavailableError('source_unknown');
  if (lang === sourceLang) throw new SameLanguageError();
  const deadline = AbortSignal.timeout(TRANSLATE_DEADLINE_MS);
  const translated: string[] = [];
  try {
    for (const piece of splitForTranslation(text)) {
      translated.push(await myMemoryTranslate(piece, myMemoryCode(sourceLang), myMemoryCode(lang), deadline));
    }
  } catch (error) {
    if (deadline.aborted) throw new TranslationUnavailableError('timeout');
    throw error;
  }
  return translated.join(' ').slice(0, REVIEW_TEXT_MAX);
}

/** The chosen candidates (verified signatures) become the newest featured
 * reviews; the oldest featured ones are deleted so no more than three are
 * stored and shown. Translation is a separate, paced step
 * (`translateFeaturedReview`), one review and one language per request:
 * `untranslated` lists the chosen reviews still without any. */
export async function featureVintedReviews(
  pool: pg.Pool,
  tokens: string[],
): Promise<FeatureVintedReviewsResult> {
  const chosen = tokens.map(verifyCandidate);
  const ids = chosen.map((review) => review.feedbackId);
  if (new Set(ids).size !== ids.length) throw new DuplicateReviewError();
  await withTransaction(pool, async (client) => {
    await lockFeaturedVintedReviews(client);
    const current = (await listFeaturedVintedReviews(client, FEATURED_REVIEWS_MAX)).map(
      (row) => row.feedback_id,
    );
    await upsertVintedReviews(client, chosen);
    await setFeaturedVintedReviews(client, nextFeaturedIds(current, ids));
  });
  const featured = await listFeaturedReviews(pool);
  return {
    featured,
    untranslated: featured
      .filter((review) => ids.includes(review.id) && Object.keys(review.translations).length === 0)
      .map((review) => review.id),
  };
}

/** Translates one stored review into one language and stores it next to
 * the others. Null when the review is not stored. No transaction is open
 * while MyMemory is called. */
export async function translateFeaturedReview(
  pool: pg.Pool,
  feedbackId: string,
  lang: ReviewLang,
): Promise<VintedReview | null> {
  const source = await getVintedReviewSource(pool, feedbackId);
  if (!source) return null;
  const text = await translateText(source.review_text, source.source_lang, lang);
  if (!(await setVintedReviewTranslation(pool, feedbackId, lang, text))) return null;
  return (await listFeaturedReviews(pool)).find((review) => review.id === feedbackId) ?? null;
}

/** Removing a review from the home page deletes it. */
export async function unfeatureReview(pool: pg.Pool, feedbackId: string): Promise<boolean> {
  return deleteVintedReview(pool, feedbackId);
}

/** Reads the shop's rating from its Vinted member page. Nothing is stored:
 * the admin compares it with the current one and applies it, or not. */
export async function scrapeVintedRating(
  pool: pg.Pool,
  profile: VintedProfile,
): Promise<VintedRatingScrapeResult> {
  if (scrapeRunning) throw new ScrapeInProgressError();
  scrapeRunning = true;
  const deadline = AbortSignal.timeout(SCRAPE_DEADLINE_MS);
  try {
    let scraped: ShopRating | null;
    try {
      const session = await openVintedSession(profile, deadline);
      scraped = parseShopRating(
        await fetchVintedMemberPage(session, profile.memberId, deadline),
        profile.memberId,
      );
    } catch (error) {
      if (deadline.aborted) throw new ScrapeTimeoutError();
      throw error;
    }
    if (!scraped) throw new VintedUnavailableError('rating_not_found');
    return {
      scraped: { ...scraped, token: signScraped({ rating: scraped }, RATING_TOKEN_AUDIENCE) },
      current: await currentRating(pool),
    };
  } finally {
    scrapeRunning = false;
  }
}

/** Stores a rating this server scraped and signed. */
export async function applyVintedRating(pool: pg.Pool, token: string): Promise<AdminShopRating> {
  const rating = verifyScraped(token, RATING_TOKEN_AUDIENCE).rating as Record<string, unknown> | undefined;
  if (
    !rating ||
    typeof rating.rating !== 'string' ||
    !/^[0-5]\.\d$/.test(rating.rating) ||
    Number(rating.rating) > 5 ||
    typeof rating.reviewCount !== 'number' ||
    !Number.isSafeInteger(rating.reviewCount) ||
    rating.reviewCount < 0
  ) {
    throw new InvalidCandidateTokenError();
  }
  await setVintedRating(pool, rating.rating, rating.reviewCount);
  return (await currentRating(pool))!;
}
