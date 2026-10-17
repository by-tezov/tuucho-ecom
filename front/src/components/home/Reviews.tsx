import { useEffect, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { fetchHomeReviews, type HomeReview, type PublicReview } from '../../api/vintedReviews';
import { shopConfig } from '../../config/env';
import { relativeTimeAgo } from '../../utils/relativeTime';
import styles from './Reviews.module.css';

function countryName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function location(review: PublicReview, lang: string): string | null {
  const country = review.countryCode ? countryName(review.countryCode, lang) : null;
  return [review.city, country].filter(Boolean).join(', ') || null;
}

/** Real buyer reviews chosen in the administration from the shop's Vinted
 * profile. Nothing chosen (or the API unreachable): the block is not shown. */
export default function Reviews() {
  const { t, lang } = useLang();
  const [reviews, setReviews] = useState<HomeReview[]>([]);
  // Reviews the visitor switched back to their original wording.
  const [showingOriginal, setShowingOriginal] = useState<ReadonlySet<string>>(new Set());
  const vintedUrl = shopConfig.platformUrls.vinted;

  useEffect(() => {
    let cancelled = false;
    fetchHomeReviews()
      .then((result) => {
        if (!cancelled) setReviews(result.reviews);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (reviews.length === 0) return null;

  return (
    <section aria-labelledby="rev-h" className={styles.section}>
      <div className={styles.inner}>
        <h2 id="rev-h" className={styles.title}>
          {t.reviews.title}
        </h2>
        <div className={styles.grid}>
          {reviews.map((review) => {
            const place = location(review, lang);
            // A translation into the visitor's language, when the review was
            // written in another one; the original stays one click away.
            const translation = review.sourceLang !== lang ? review.translations[lang] : undefined;
            const original = !translation || showingOriginal.has(review.id);
            return (
              <figure key={review.id} className={styles.card}>
                <div
                  role="img"
                  aria-label={t.reviews.starsAria.replace('{n}', String(review.rating))}
                  className={styles.stars}
                >
                  {'★'.repeat(review.rating)}
                </div>
                <blockquote className={styles.text} lang={original ? (review.sourceLang ?? undefined) : lang}>
                  {original ? review.text : translation}
                </blockquote>
                {translation && (
                  <button
                    type="button"
                    className={styles.translateToggle}
                    onClick={() =>
                      setShowingOriginal((current) => {
                        const next = new Set(current);
                        if (next.has(review.id)) next.delete(review.id);
                        else next.add(review.id);
                        return next;
                      })
                    }
                  >
                    {original ? t.reviews.showTranslation : t.reviews.showOriginal}
                  </button>
                )}
                <figcaption className={styles.caption}>
                  <span className={styles.who}>
                    <strong className={styles.name}>{review.author}</strong>
                    {place ? ` · ${place}` : null}
                  </span>
                  <time className={styles.date} dateTime={review.reviewedAt}>
                    {relativeTimeAgo(review.reviewedAt, lang)}
                  </time>
                </figcaption>
              </figure>
            );
          })}
        </div>
        {vintedUrl.startsWith('http') && (
          <p className={styles.more}>
            <a
              href={`${vintedUrl}?tab=feedback`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.moreLink}
            >
              {t.reviews.seeAll}
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
