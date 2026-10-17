import { Router } from 'express';
import { pool } from '@kernel/back/db/pool';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { isPluginEffectivelyEnabled } from '@kernel/back/modules/plugins/application/pluginStore';
import { recordAdminActivityBestEffort } from '@kernel/back/modules/activity/application/recordAdminActivity';
import {
  FEATURED_REVIEWS_MAX,
  isReviewLang,
  parseScrapeCount,
  parseVintedProfileUrl,
} from '../domain/vintedReviewsRules.js';
import {
  DuplicateReviewError,
  InvalidCandidateTokenError,
  ScrapeInProgressError,
  ScrapeTimeoutError,
  SameLanguageError,
  TranslationUnavailableError,
  translateFeaturedReview,
  applyVintedRating,
  locateVintedCandidate,
  scrapeVintedRating,
  VintedUnavailableError,
  featureVintedReviews,
  listAdminVintedReviews,
  scrapeVintedReviews,
  unfeatureReview,
} from '../application/vintedReviewsWorkflow.js';

export const vintedReviewsAdminRouter = Router();
vintedReviewsAdminRouter.use(async (_req, res, next) => {
  if (!(await isPluginEffectivelyEnabled('tuucho-commerce-vinted-review'))) {
    res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
    return;
  }
  next();
});
vintedReviewsAdminRouter.use(requireAuth, requirePermission('reviews'));

const FEEDBACK_ID = /^\d{1,19}$/;
/** A signed candidate is a few hundred bytes; this only rejects junk. */
const TOKEN_MAX = 8192;

vintedReviewsAdminRouter.get('/', async (_req, res) => {
  const result = await listAdminVintedReviews(pool);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ success: true, ...result });
});

vintedReviewsAdminRouter.post('/scrape', async (req, res) => {
  const profile = parseVintedProfileUrl(req.body?.profileUrl);
  const count = parseScrapeCount(req.body?.count);
  if (!profile || count === null) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const result = await scrapeVintedReviews(profile, count);
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'settings',
      action: 'reviews.vinted.scrape',
      summary: `Recuperation de ${result.candidates.length} avis Vinted`,
      targetType: 'vinted_member',
      targetId: profile.memberId,
      detail: {
        requested: count,
        found: result.candidates.length,
        automaticDiscarded: result.automaticDiscarded,
      },
    });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ScrapeInProgressError) {
      res.status(409).json({ success: false, error: { code: 'scrape_in_progress' } });
      return;
    }
    if (error instanceof ScrapeTimeoutError) {
      res.status(504).json({ success: false, error: { code: 'vinted_timeout' } });
      return;
    }
    if (error instanceof VintedUnavailableError) {
      res.status(502).json({ success: false, error: { code: 'vinted_unavailable', reason: error.reason } });
      return;
    }
    throw error;
  }
});

vintedReviewsAdminRouter.post('/locate', async (req, res) => {
  const profile = parseVintedProfileUrl(req.body?.profileUrl);
  const token: unknown = req.body?.token;
  if (!profile || typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    res.json({ success: true, candidate: await locateVintedCandidate(profile, token) });
  } catch (error) {
    if (error instanceof InvalidCandidateTokenError) {
      res.status(400).json({ success: false, error: { code: 'invalid_review_token' } });
      return;
    }
    if (error instanceof ScrapeTimeoutError) {
      res.status(504).json({ success: false, error: { code: 'vinted_timeout' } });
      return;
    }
    if (error instanceof VintedUnavailableError) {
      res.status(502).json({ success: false, error: { code: 'vinted_unavailable', reason: error.reason } });
      return;
    }
    throw error;
  }
});

vintedReviewsAdminRouter.post('/featured', async (req, res) => {
  const tokens: unknown = req.body?.tokens;
  if (
    !Array.isArray(tokens) ||
    tokens.length < 1 ||
    tokens.length > FEATURED_REVIEWS_MAX ||
    !tokens.every((token) => typeof token === 'string' && token.length > 0 && token.length <= TOKEN_MAX)
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const result = await featureVintedReviews(pool, tokens as string[]);
    const added = result.featured.slice(0, tokens.length).map((review) => review.id);
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'settings',
      action: 'reviews.vinted.feature',
      summary: `Avis Vinted affiches sur l'accueil: ${tokens.length} ajoute(s)`,
      targetType: 'vinted_review',
      targets: added,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof InvalidCandidateTokenError) {
      res.status(400).json({ success: false, error: { code: 'invalid_review_token' } });
      return;
    }
    if (error instanceof DuplicateReviewError) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    throw error;
  }
});

vintedReviewsAdminRouter.post('/featured/:feedbackId/translate', async (req, res) => {
  const feedbackId = String(req.params.feedbackId);
  const lang: unknown = req.body?.lang;
  if (!FEEDBACK_ID.test(feedbackId) || !isReviewLang(lang)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const review = await translateFeaturedReview(pool, feedbackId, lang);
    if (!review) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'settings',
      action: 'reviews.vinted.translate',
      summary: `Traduction (${lang}) d'un avis Vinted de l'accueil`,
      targetType: 'vinted_review',
      targetId: feedbackId,
    });
    res.json({ success: true, review });
  } catch (error) {
    if (error instanceof SameLanguageError) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (error instanceof TranslationUnavailableError) {
      res
        .status(502)
        .json({ success: false, error: { code: 'translation_unavailable', reason: error.reason } });
      return;
    }
    throw error;
  }
});

vintedReviewsAdminRouter.delete('/featured/:feedbackId', async (req, res) => {
  const feedbackId = String(req.params.feedbackId);
  if (!FEEDBACK_ID.test(feedbackId)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const removed = await unfeatureReview(pool, feedbackId);
  if (!removed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'settings',
    action: 'reviews.vinted.unfeature',
    summary: "Avis Vinted retire de l'accueil et supprime",
    targetType: 'vinted_review',
    targetId: feedbackId,
  });
  res.json({ success: true });
});

vintedReviewsAdminRouter.post('/rating/scrape', async (req, res) => {
  const profile = parseVintedProfileUrl(req.body?.profileUrl);
  if (!profile) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    res.json({ success: true, ...(await scrapeVintedRating(pool, profile)) });
  } catch (error) {
    if (error instanceof ScrapeInProgressError) {
      res.status(409).json({ success: false, error: { code: 'scrape_in_progress' } });
      return;
    }
    if (error instanceof ScrapeTimeoutError) {
      res.status(504).json({ success: false, error: { code: 'vinted_timeout' } });
      return;
    }
    if (error instanceof VintedUnavailableError) {
      res.status(502).json({ success: false, error: { code: 'vinted_unavailable', reason: error.reason } });
      return;
    }
    throw error;
  }
});

vintedReviewsAdminRouter.put('/rating', async (req, res) => {
  const token: unknown = req.body?.token;
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const rating = await applyVintedRating(pool, token);
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'settings',
      action: 'reviews.vinted.rating',
      summary: `Note Vinted de l'accueil: ${rating.rating} (${rating.reviewCount} avis)`,
      targetType: 'vinted_rating',
      detail: { rating: rating.rating, reviewCount: rating.reviewCount },
    });
    res.json({ success: true, rating });
  } catch (error) {
    if (error instanceof InvalidCandidateTokenError) {
      res.status(400).json({ success: false, error: { code: 'invalid_review_token' } });
      return;
    }
    throw error;
  }
});
