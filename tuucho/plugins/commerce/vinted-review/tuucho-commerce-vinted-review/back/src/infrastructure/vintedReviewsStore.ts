/** SQL for vinted-reviews. Private to this module: another module must go through
 * `domain/` or `application/` instead of importing anything here.
 *
 * Only the reviews shown on the home page are stored (three at most). Scraped
 * candidates never reach the database. */
import type pg from 'pg';

export interface VintedReviewRow {
  feedback_id: string;
  author_vinted_id: string;
  author_login: string;
  review_text: string;
  rating: number;
  city: string | null;
  country_code: string | null;
  /** timestamptz comes back as text (see db/pool.ts). */
  reviewed_at: string;
  scraped_at: string;
  featured_at: string | null;
  source_lang: string | null;
  /** jsonb, parsed by pg. */
  translations: unknown;
}

export interface VintedReviewInsert {
  feedbackId: string;
  authorVintedId: string;
  authorLogin: string;
  text: string;
  rating: number;
  city: string | null;
  countryCode: string | null;
  reviewedAt: string;
  /** Site language the review is taken to be in (the Vinted storefront's). */
  sourceLang: string | null;
}

const COLUMNS = `feedback_id::text as feedback_id, author_vinted_id::text as author_vinted_id,
  author_login, review_text, rating, city, country_code, reviewed_at, scraped_at, featured_at,
  source_lang, translations`;

export async function listFeaturedVintedReviews(db: pg.Pool | pg.PoolClient, limit: number) {
  const { rows } = await db.query<VintedReviewRow>(
    `select ${COLUMNS} from vinted_reviews where featured_at is not null
     order by featured_at desc, feedback_id desc limit $1`,
    [limit],
  );
  return rows;
}

/** Serializes concurrent featured-set changes for the rest of the transaction. */
export async function lockFeaturedVintedReviews(client: pg.PoolClient): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtext('vinted_reviews.featured'))`);
}

/** Inserts the newly chosen reviews (or refreshes them if already stored).
 * Translations are written separately and survive a re-choice. */
export async function upsertVintedReviews(
  client: pg.PoolClient,
  reviews: VintedReviewInsert[],
): Promise<void> {
  if (reviews.length === 0) return;
  await client.query(
    `insert into vinted_reviews
       (feedback_id, author_vinted_id, author_login, review_text, rating, city, country_code, reviewed_at,
        source_lang, featured_at)
     select s.*, now() from unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::smallint[],
                          $6::text[], $7::char(2)[], $8::timestamptz[], $9::text[]) as s
     on conflict (feedback_id) do update set
       author_login = excluded.author_login,
       review_text = excluded.review_text,
       rating = excluded.rating,
       city = excluded.city,
       country_code = excluded.country_code,
       source_lang = coalesce(excluded.source_lang, vinted_reviews.source_lang),
       scraped_at = now()`,
    [
      reviews.map((review) => review.feedbackId),
      reviews.map((review) => review.authorVintedId),
      reviews.map((review) => review.authorLogin),
      reviews.map((review) => review.text),
      reviews.map((review) => review.rating),
      reviews.map((review) => review.city),
      reviews.map((review) => review.countryCode),
      reviews.map((review) => review.reviewedAt),
      reviews.map((review) => review.sourceLang),
    ],
  );
}

export async function getVintedReviewSource(db: pg.Pool | pg.PoolClient, feedbackId: string) {
  const { rows } = await db.query<{ review_text: string; source_lang: string | null }>(
    `select review_text, source_lang from vinted_reviews where feedback_id = $1::bigint`,
    [feedbackId],
  );
  return rows[0] ?? null;
}

/** Adds or replaces one language, keeping the others. */
export async function setVintedReviewTranslation(
  db: pg.Pool | pg.PoolClient,
  feedbackId: string,
  lang: string,
  text: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update vinted_reviews set translations = translations || jsonb_build_object($2::text, $3::text)
     where feedback_id = $1::bigint`,
    [feedbackId, lang, text],
  );
  return (rowCount ?? 0) > 0;
}

/** Keeps exactly `orderedNewestFirst`, `[0]` getting the latest timestamp;
 * every other row is deleted. */
export async function setFeaturedVintedReviews(client: pg.PoolClient, orderedNewestFirst: string[]) {
  await client.query(`delete from vinted_reviews where not (feedback_id = any($1::bigint[]))`, [
    orderedNewestFirst,
  ]);
  await client.query(
    `update vinted_reviews v
     set featured_at = now() - (s.ord * interval '1 millisecond')
     from unnest($1::bigint[]) with ordinality as s(id, ord)
     where v.feedback_id = s.id`,
    [orderedNewestFirst],
  );
}

export async function deleteVintedReview(db: pg.Pool | pg.PoolClient, feedbackId: string): Promise<boolean> {
  const { rowCount } = await db.query(`delete from vinted_reviews where feedback_id = $1::bigint`, [
    feedbackId,
  ]);
  return (rowCount ?? 0) > 0;
}

export interface VintedRatingRow {
  rating: string;
  review_count: number;
  updated_at: string;
}

export async function getVintedRating(db: pg.Pool | pg.PoolClient): Promise<VintedRatingRow | null> {
  const { rows } = await db.query<VintedRatingRow>(
    `select rating::text as rating, review_count, updated_at from vinted_rating where id`,
  );
  return rows[0] ?? null;
}

export async function setVintedRating(db: pg.Pool | pg.PoolClient, rating: string, reviewCount: number) {
  await db.query(
    `insert into vinted_rating (id, rating, review_count, updated_at) values (true, $1::numeric, $2, now())
     on conflict (id) do update set rating = excluded.rating, review_count = excluded.review_count, updated_at = now()`,
    [rating, reviewCount],
  );
}
