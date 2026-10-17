import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../../../db/pool.js';
import { optionalAuth } from '../../../middleware/optionalAuth.js';
import { giftCreateRateLimiter } from '../../../middleware/rateLimiters.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import { maxPackedNailQuantity } from '../infrastructure/packedQuantity.js';
import { listOpenOffersForGiverUser } from '../infrastructure/giftOfferRepo.js';
import { listFilterOptions } from '../../catalog/application/products.js';
import { createGiftOffer, parseCreateGiftOfferBody } from '../application/createOffer.js';
import { clocksOf } from '../application/presenters.js';
import { withGiftErrors } from './giftErrors.js';
import { giftCreateOfferBodySchema, parseGiftSchema } from './giftSchemas.js';

export const giftPublicRouter = Router();

/** Guest create omits Authorization. A presented bearer that optionalAuth
 * dropped (expired, locked, garbage) must 401 so the shop can refresh,
 * instead of being parsed as a guest without GDPR (`400 invalid_request`). */
function rejectUnresolvedBearer(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  if (header.toLowerCase().startsWith('bearer ') && !req.user) {
    res.status(401).json({ success: false, error: { code: 'unauthorized' } });
    return;
  }
  next();
}

giftPublicRouter.get('/settings', async (_req, res) => {
  // Same price range the gallery filter shows, in-stock only: what the
  // receiver can actually buy is what the budget should be measured against.
  // Cached per (language, inStockOnly) in the catalog module, so this is a
  // map lookup on all but the first call after an import.
  const [settings, maxSetsCeiling, filters] = await Promise.all([
    getGiftSettings(pool),
    maxPackedNailQuantity(pool),
    listFilterOptions(pool, 'fr', false),
  ]);
  res.json({
    success: true,
    enabled: true,
    maxSetsCeiling,
    minBudget: settings.minBudget,
    maxBudgetCeiling: settings.maxBudgetCeiling,
    maxAccessoryBudgetCeiling: settings.maxAccessoryBudgetCeiling,
    receiverTokenTtlDays: settings.receiverTokenTtlDays,
    stockHoldTtlDays: settings.stockHoldTtlDays,
    giverPayTtlDays: settings.giverPayTtlDays,
    setPriceRange: filters.priceRange,
  });
});

giftPublicRouter.post(
  '/offers',
  optionalAuth,
  rejectUnresolvedBearer,
  giftCreateRateLimiter,
  async (req, res) => {
    await withGiftErrors(res, async () => {
      const session = req.user ? { id: req.user.id, email: req.user.email } : null;
      const body = parseGiftSchema(giftCreateOfferBodySchema, req.body ?? {});
      const input = body ? parseCreateGiftOfferBody(body, session) : null;
      if (!input) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      const created = await createGiftOffer(pool, input);
      res.status(201).json({
        success: true,
        checkEmail: created.checkEmail,
        status: created.offer.status,
        offerId: created.offer.id,
        receiverUrl: created.receiverUrl,
        cartId: created.offer.cartId,
      });
    });
  },
);

giftPublicRouter.get('/mine', requireAuth, async (req, res) => {
  const offers = await listOpenOffersForGiverUser(pool, req.user!.id);
  res.json({
    success: true,
    offers: offers.map((offer) => ({
      id: offer.id,
      status: offer.status,
      receiverName: offer.receiverName,
      giverToken: offer.giverToken,
      cartId: offer.cartId,
      maxSets: offer.maxSets,
      maxBudget: offer.maxBudget,
      allowAccessories: offer.allowAccessories,
      maxAccessoryBudget: offer.maxAccessoryBudget,
      clocks: clocksOf(offer),
    })),
  });
});
