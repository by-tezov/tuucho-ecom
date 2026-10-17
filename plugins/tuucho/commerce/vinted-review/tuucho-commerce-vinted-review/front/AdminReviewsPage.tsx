import { useCallback, useEffect, useRef, useState } from 'react';
import { Seo } from '@kernel/front/components/seo/Seo';
import { Button } from '@kernel/front/components/ui/Button';
import { ConfirmModal } from '@kernel/front/components/ui/ConfirmModal';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import {
  applyAdminVintedRating,
  featureAdminVintedReviews,
  locateAdminVintedCandidate,
  scrapeAdminVintedRating,
  getAdminVintedReviews,
  scrapeAdminVintedReviews,
  translateAdminVintedReview,
  unfeatureAdminVintedReview,
} from '@kernel/front/api/admin/vintedReviews';
import {
  type AdminShopRating,
  type AdminVintedReview,
  type HomeReview,
  type PublicReview,
  type VintedRatingScrapeResult,
  type VintedReviewCandidate,
} from '@kernel/front/api/vintedReviews';
import { ApiError } from '@kernel/front/api/errors';
import { isApiRequestTimeoutError } from '@kernel/front/api/http';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { useToast } from '@kernel/front/state/ToastContext';
import { useLang } from '@kernel/front/assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '@kernel/front/assets/i18n/admin';
import { adminPath } from '@kernel/front/utils/adminRoute';
import { withMinDuration } from '@kernel/front/utils/withMinDuration';
import { shopConfig } from '@kernel/front/config/env';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import { NotFoundPage } from '@kernel/front/routes/NotFoundPage';
import styles from './AdminReviewsPage.module.css';

/** Mirrors the backend bounds (`vintedReviewsRules.ts`). */
const FEATURED_MAX = 3;
const COUNT_MIN = 1;
const COUNT_MAX = 30;
const COUNT_DEFAULT = 5;

function scrapeErrorMessage(error: unknown, a: AdminUiStrings): string {
  if (isApiRequestTimeoutError(error)) return a.reviews.errTooSlow;
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'vinted_timeout':
        return a.reviews.errTooSlowFewer;
      case 'vinted_unavailable': {
        const detail = error.reason ? a.reviews.vintedReply(error.reason) : '';
        if (error.reason && /_(401|403|429)$/.test(error.reason)) return a.reviews.errRefused(detail);
        return a.reviews.errUnreadable(detail);
      }
      case 'scrape_in_progress':
        return a.reviews.errInProgress;
      case 'invalid_request':
        return a.reviews.errBadProfile;
    }
  }
  return a.reviews.errScrapeFailed;
}

/** The site languages (same set as the i18n dictionaries). Local on
 * purpose: importing the i18n language module here regroups the dictionaries
 * into the entry bundle. */
const LANGUAGE_ORDER = ['en', 'fr'] as const;

/** Site languages a review still lacks; none when its own language is
 * unknown (it cannot be translated). */
function missingLangs(review: AdminVintedReview): string[] {
  if (!review.sourceLang) return [];
  return LANGUAGE_ORDER.filter((code) => code !== review.sourceLang && !review.translations[code]);
}

function languageName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function dateLabel(value: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(value));
}

function placeLabel(review: PublicReview, lang: string, a: AdminUiStrings): string {
  let country: string | null = null;
  if (review.countryCode) {
    try {
      country =
        new Intl.DisplayNames([lang], { type: 'region' }).of(review.countryCode) ?? review.countryCode;
    } catch {
      country = review.countryCode;
    }
  }
  return [review.city, country].filter(Boolean).join(', ') || a.reviews.locationHidden;
}

/** A review as a visitor in the current language sees it: the translation
 * when there is one (with the same original/translation switch as the home
 * page), else the original. Scraped candidates have no translation yet. */
function ReviewBody({
  review,
  lang,
}: {
  review: PublicReview & Partial<Pick<HomeReview, 'sourceLang' | 'translations'>>;
  lang: string;
}) {
  const { t } = useLang();
  const a = useAdminStrings();
  const [showOriginal, setShowOriginal] = useState(false);
  const translation = review.sourceLang !== lang ? review.translations?.[lang] : undefined;
  const original = !translation || showOriginal;
  return (
    <div className={styles.reviewBody}>
      <span
        className={styles.stars}
        aria-label={t.reviews.starsAria.replace('{n}', String(review.rating))}
        role="img"
      >
        {'★'.repeat(review.rating)}
        <span className={styles.starsOff}>{'★'.repeat(5 - review.rating)}</span>
      </span>
      <blockquote className={styles.text} lang={original ? (review.sourceLang ?? undefined) : lang}>
        {original ? review.text : translation}
      </blockquote>
      {translation && (
        <button
          type="button"
          className={styles.translateToggle}
          onClick={() => setShowOriginal((value) => !value)}
        >
          {original ? t.reviews.showTranslation : t.reviews.showOriginal}
        </button>
      )}
      <span className={styles.meta}>
        <strong>{review.author}</strong> · {placeLabel(review, lang, a)} ·{' '}
        {dateLabel(review.reviewedAt, lang)}
      </span>
    </div>
  );
}

/** Home-page reviews: what is shown now, a Vinted scrape on demand, and the
 * choice of up to three scraped reviews to show. */
export function AdminReviewsPage() {
  const reviewsOn = usePluginEnabled('tuucho-commerce-vinted-review');
  const { t, lang } = useLang();
  const a = useAdminStrings();
  const toast = useToast();
  const { authedRequest } = useAuthSession();
  const [featured, setFeatured] = useState<AdminVintedReview[]>([]);
  // Never stored on the server: a reload of this page drops them.
  const [candidates, setCandidates] = useState<VintedReviewCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [count, setCount] = useState(String(COUNT_DEFAULT));
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeNote, setScrapeNote] = useState<string | null>(null);
  // Locations are read one member page at a time after the scrape.
  const [locating, setLocating] = useState<{ done: number; total: number } | null>(null);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const stopLocatingRef = useRef(false);
  // Translations go one review and one language per request, paced server side.
  const [translating, setTranslating] = useState<{ done: number; total: number } | null>(null);
  const [translateNote, setTranslateNote] = useState<string | null>(null);
  const stopTranslatingRef = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminVintedReview | null>(null);
  const [rating, setRating] = useState<AdminShopRating | null>(null);
  // Scraped, not applied: the admin decides whether it replaces `rating`.
  const [ratingScrape, setRatingScrape] = useState<VintedRatingScrapeResult['scraped'] | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const profileUrl = shopConfig.platformUrls.vinted;
  const profileConfigured = profileUrl.startsWith('http');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => getAdminVintedReviews(token)),
        shopConfig.loadingMinMs.short,
      );
      setFeatured(result.featured);
      setRating(result.rating);
    } catch {
      setLoadError(a.reviews.loadError);
    } finally {
      setLoading(false);
    }
  }, [authedRequest, a.reviews.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      stopLocatingRef.current = true;
      stopTranslatingRef.current = true;
    },
    [],
  );

  const countValue = Number(count);
  const countValid = Number.isInteger(countValue) && countValue >= COUNT_MIN && countValue <= COUNT_MAX;
  const busy = loading || scraping || saving || locating !== null || translating !== null;

  async function scrape() {
    if (busy || !countValid || !profileConfigured) return;
    setScraping(true);
    setScrapeError(null);
    setScrapeNote(null);
    setActionError(null);
    try {
      const result = await authedRequest((token) => scrapeAdminVintedReviews(token, profileUrl, countValue));
      setCandidates(result.candidates);
      setSelected([]);
      const notes = [
        a.reviews.foundCount(result.candidates.length),
        a.reviews.automaticIgnored(result.automaticDiscarded),
      ];
      if (result.exhausted) notes.push(a.reviews.fewerThanAsked);
      setScrapeNote(`${notes.join(', ')}.`);
      setScraping(false);
      await locateAll(result.candidates);
    } catch (error) {
      setScrapeError(scrapeErrorMessage(error, a));
    } finally {
      setScraping(false);
    }
  }

  /** One request per reviewer, one after the other: the server paces them
   * like a person browsing. The first refusal stops the run, so a blocked
   * Vinted is not asked again and again. */
  async function locateAll(list: VintedReviewCandidate[]) {
    if (list.length === 0) return;
    stopLocatingRef.current = false;
    setLocateNote(null);
    setLocating({ done: 0, total: list.length });
    let done = 0;
    try {
      for (const candidate of list) {
        if (stopLocatingRef.current) {
          setLocateNote(a.reviews.locateStopped);
          return;
        }
        try {
          const result = await authedRequest((token) =>
            locateAdminVintedCandidate(token, profileUrl, candidate.token),
          );
          setCandidates((current) =>
            current.map((review) => (review.id === result.candidate.id ? result.candidate : review)),
          );
        } catch (error) {
          setLocateNote(a.reviews.locateInterrupted(done, list.length, scrapeErrorMessage(error, a)));
          return;
        }
        done += 1;
        setLocating({ done, total: list.length });
      }
    } finally {
      setLocating(null);
    }
  }

  async function scrapeRating() {
    if (busy || !profileConfigured) return;
    setScraping(true);
    setRatingError(null);
    setRatingScrape(null);
    try {
      const result = await authedRequest((token) => scrapeAdminVintedRating(token, profileUrl));
      setRatingScrape(result.scraped);
      setRating(result.current);
    } catch (error) {
      setRatingError(scrapeErrorMessage(error, a));
    } finally {
      setScraping(false);
    }
  }

  async function applyRating() {
    if (busy || !ratingScrape) return;
    setSaving(true);
    setRatingError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => applyAdminVintedRating(token, ratingScrape.token)),
        shopConfig.loadingMinMs.short,
      );
      setRating(result.rating);
      setRatingScrape(null);
      toast(a.reviews.ratingUpdatedToast(result.rating.rating));
    } catch (error) {
      setRatingError(
        error instanceof ApiError && error.code === 'invalid_review_token'
          ? a.reviews.ratingTokenExpired
          : a.reviews.ratingUpdateError,
      );
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= FEATURED_MAX
          ? current
          : [...current, id],
    );
  }

  async function publishSelection() {
    if (busy || selected.length === 0) return;
    setSaving(true);
    setActionError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          featureAdminVintedReviews(
            token,
            selected.flatMap((id) => candidates.find((review) => review.id === id)?.token ?? []),
          ),
        ),
        shopConfig.loadingMinMs.short,
      );
      setFeatured(result.featured);
      toast(a.reviews.shownToast(selected.length));
      const chosen = result.featured.filter((review) => selected.includes(review.id));
      setSaving(false);
      await translateAll(chosen);
      setSelected([]);
    } catch (error) {
      setActionError(
        error instanceof ApiError && error.code === 'invalid_review_token'
          ? a.reviews.selectionTokenExpired
          : a.reviews.selectionError,
      );
    } finally {
      setSaving(false);
    }
  }

  /** Translation status of a review on the home page, in plain words. */
  function translationLabel(review: AdminVintedReview): string {
    if (!review.sourceLang) return a.reviews.sourceUnknown;
    const source = languageName(review.sourceLang, lang);
    const missing = missingLangs(review).length;
    const done = LANGUAGE_ORDER.length - 1 - missing;
    if (done === 0) return a.reviews.notTranslatedYet(source);
    if (missing === 0) return a.reviews.translatedAll(source);
    return a.reviews.translatedSome(source, done, LANGUAGE_ORDER.length - 1);
  }

  /** Every missing language of every given review, one request after the
   * other (the server paces them like a person). The first failure stops the
   * run: what was translated stays, the rest can be resumed with Traduire. */
  async function translateAll(reviews: AdminVintedReview[]) {
    const jobs = reviews.flatMap((review) => missingLangs(review).map((code) => ({ review, code })));
    if (jobs.length === 0) return;
    stopTranslatingRef.current = false;
    setTranslateNote(null);
    setTranslating({ done: 0, total: jobs.length });
    let done = 0;
    try {
      for (const { review, code } of jobs) {
        if (stopTranslatingRef.current) {
          setTranslateNote(a.reviews.translateStopped);
          return;
        }
        try {
          const result = await authedRequest((token) => translateAdminVintedReview(token, review.id, code));
          setFeatured((current) => current.map((entry) => (entry.id === review.id ? result.review : entry)));
        } catch (error) {
          const reason = error instanceof ApiError ? error.reason : undefined;
          setTranslateNote(
            reason === 'quota'
              ? a.reviews.translateQuota
              : a.reviews.translateInterrupted(done, jobs.length, reason ? a.reviews.reply(reason) : ''),
          );
          return;
        }
        done += 1;
        setTranslating({ done, total: jobs.length });
      }
      toast(a.reviews.translatedToast);
    } finally {
      setTranslating(null);
    }
  }

  async function confirmRemove() {
    const review = removing;
    if (!review || busy) return;
    setRemoving(null);
    setSaving(true);
    setActionError(null);
    try {
      await withMinDuration(
        authedRequest((token) => unfeatureAdminVintedReview(token, review.id)),
        shopConfig.loadingMinMs.short,
      );
      toast(a.reviews.removedToast);
      await load();
    } catch {
      setActionError(a.reviews.removeError);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const featuredIds = new Set(featured.map((review) => review.id));
  // Choosing a review already on the home page only moves it to the top.
  const added = selected.filter((id) => !featuredIds.has(id)).length;
  const replaced = Math.max(0, featured.length + added - FEATURED_MAX);

  if (!reviewsOn) return <NotFoundPage />;

  return (
    <section className={styles.section} aria-labelledby="admin-reviews-h">
      <Seo
        title={a.nav.reviewsLabel}
        description={a.nav.reviewsDescription}
        path={adminPath('/reviews')}
        noindex
      />
      <h1 id="admin-reviews-h" className={styles.title}>
        {a.nav.reviewsLabel}
      </h1>

      {loadError && (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )}
      {actionError && (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      )}

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>{a.reviews.ratingTitle}</h2>
        {rating ? (
          <p className={styles.ratingLine}>
            <span className={styles.ratingValue}>★ {rating.rating}</span>
            {a.reviews.ratingMeta(rating.reviewCount, dateLabel(rating.updatedAt, lang))}
          </p>
        ) : (
          !loading && <p className={styles.empty}>{a.reviews.ratingNone}</p>
        )}
        <div className={styles.actions}>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !profileConfigured}
            onClick={() => void scrapeRating()}
          >
            {a.reviews.ratingScrape}
          </Button>
        </div>
        {ratingError && (
          <p className={styles.error} role="alert">
            {ratingError}
          </p>
        )}
        {ratingScrape && (
          <div className={styles.ratingCompare} role="status">
            <p className={styles.ratingLine}>
              {a.reviews.ratingOnVinted} <span className={styles.ratingValue}>★ {ratingScrape.rating}</span>{' '}
              {a.reviews.ratingReviewCount(ratingScrape.reviewCount)}
              {rating &&
              rating.rating === ratingScrape.rating &&
              rating.reviewCount === ratingScrape.reviewCount
                ? a.reviews.ratingSame
                : rating
                  ? a.reviews.ratingCurrentlyShown(rating.rating, rating.reviewCount)
                  : ''}
            </p>
            <div className={styles.actions}>
              <Button type="button" disabled={busy} onClick={() => void applyRating()}>
                {a.reviews.ratingApply}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setRatingScrape(null)}>
                {a.reviews.ratingKeep}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>{a.reviews.featuredTitle(featured.length, FEATURED_MAX)}</h2>
        {translating && (
          <div className={styles.actions} role="status">
            <span className={styles.hint}>
              {a.reviews.translateProgress(translating.done, translating.total)}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                stopTranslatingRef.current = true;
              }}
            >
              {a.reviews.stop}
            </Button>
          </div>
        )}
        {translateNote && (
          <p className={styles.hint} role="status">
            {translateNote}
          </p>
        )}
        {featured.length === 0 && !loading ? (
          <p className={styles.empty}>{a.reviews.featuredEmpty(t.reviews.title)}</p>
        ) : (
          <ul className={styles.list}>
            {featured.map((review) => (
              <li key={review.id} className={styles.row}>
                <div className={styles.pickBody}>
                  <ReviewBody review={review} lang={lang} />
                  <span className={styles.meta}>{translationLabel(review)}</span>
                  {missingLangs(review).length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className={styles.inlineAction}
                      disabled={busy}
                      onClick={() => void translateAll([review])}
                    >
                      {a.reviews.translate}
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghostDanger"
                  disabled={busy}
                  onClick={() => setRemoving(review)}
                  aria-label={a.reviews.removeAria(review.author)}
                >
                  {a.reviews.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>{a.reviews.scrapeTitle}</h2>
        <p className={styles.note}>
          {a.reviews.scrapeIntro}{' '}
          {profileConfigured ? (
            <a href={`${profileUrl}?tab=feedback`} target="_blank" rel="noopener noreferrer">
              Vinted
            </a>
          ) : (
            'Vinted'
          )}
          {a.reviews.scrapeExplain}
        </p>
        {!profileConfigured && (
          <p className={styles.error} role="alert">
            {a.reviews.noProfile}
          </p>
        )}
        <form
          className={styles.scrapeForm}
          onSubmit={(event) => {
            event.preventDefault();
            void scrape();
          }}
        >
          <div className={styles.field}>
            <label htmlFor="reviews-count">{a.reviews.countLabel}</label>
            <input
              id="reviews-count"
              type="number"
              inputMode="numeric"
              min={COUNT_MIN}
              max={COUNT_MAX}
              step={1}
              value={count}
              disabled={busy}
              aria-invalid={!countValid}
              aria-describedby="reviews-count-hint"
              onChange={(event) => setCount(event.target.value)}
            />
            <span id="reviews-count-hint" className={countValid ? styles.hint : styles.fieldError}>
              {a.reviews.countHint(COUNT_MIN, COUNT_MAX)}
            </span>
          </div>
          <Button type="submit" disabled={busy || !countValid || !profileConfigured}>
            {a.reviews.scrape}
          </Button>
        </form>
        {scrapeError && (
          <p className={styles.error} role="alert">
            {scrapeError}
          </p>
        )}
        {scrapeNote && (
          <p className={styles.notice} role="status">
            {scrapeNote}
          </p>
        )}
        {locating && (
          <div className={styles.actions} role="status">
            <span className={styles.hint}>{a.reviews.locateProgress(locating.done, locating.total)}</span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                stopLocatingRef.current = true;
              }}
            >
              {a.reviews.stop}
            </Button>
          </div>
        )}
        {locateNote && (
          <p className={styles.hint} role="status">
            {locateNote}
          </p>
        )}
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>{a.reviews.candidatesTitle}</h2>
        {candidates.length === 0 && !loading ? (
          <p className={styles.empty}>{a.reviews.candidatesEmpty}</p>
        ) : (
          <>
            <p className={styles.note}>{a.reviews.candidatesHelp(FEATURED_MAX)}</p>
            <fieldset className={styles.fieldset} disabled={busy}>
              <legend className="visuallyHidden">{a.reviews.candidatesLegend}</legend>
              <ul className={styles.list}>
                {candidates.map((review) => {
                  const checked = selected.includes(review.id);
                  const onHome = featuredIds.has(review.id);
                  const full = !checked && selected.length >= FEATURED_MAX;
                  return (
                    <li key={review.id} className={`${styles.row} ${checked ? styles.rowChecked : ''}`}>
                      <label className={styles.pick}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={full}
                          onChange={() => toggle(review.id)}
                        />
                        <div className={styles.pickBody}>
                          {onHome && <span className={styles.badge}>{a.reviews.alreadyShown}</span>}
                          <ReviewBody review={review} lang={lang} />
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <div className={styles.actions}>
              <Button
                type="button"
                disabled={busy || selected.length === 0}
                onClick={() => void publishSelection()}
              >
                {a.reviews.showOnHome}
                {selected.length > 0 ? ` (${selected.length})` : ''}
              </Button>
              {replaced > 0 && (
                <span className={styles.hint} role="status">
                  {a.reviews.replacedWarning(replaced)}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {removing && (
        <ConfirmModal
          title={a.reviews.removeTitle}
          message={a.reviews.removeMessage(removing.author)}
          confirmLabel={a.reviews.remove}
          confirmDanger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(null)}
        />
      )}
      {scraping && <LoadingModal message={a.reviews.scrapeLoading} />}
      {(loading || saving) && !scraping && (
        <LoadingModal message={saving ? t.admin.actionLoading : t.admin.contentLoading} />
      )}
    </section>
  );
}
