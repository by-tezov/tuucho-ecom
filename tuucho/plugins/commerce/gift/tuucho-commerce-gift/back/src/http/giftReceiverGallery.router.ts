import { Router } from 'express';
import { config } from '@kernel/back/config/env';
import { pool } from '@kernel/back/db/pool';
import { boundedPrintable } from '@kernel/back/utils/fieldLimits';
import { requestLanguage } from '@kernel/back/utils/language';
import { listFilterOptions, listGalleryFeed, getProductByUid } from '@kernel/back/modules/catalog/application/products';
import type { GalleryFeedParams } from '@kernel/back/modules/catalog/application/products';
import { isProductUid } from '@kernel/back/modules/catalog/domain/productUid';
import {
  isGalleryItemPubliclyAccessible,
  outOfStockDisplayFlags,
  outOfStockProductsEnabled,
} from '@kernel/back/modules/catalog/application/outOfStockVisibility';
import { loadReceiverOffer } from '../application/loadOffer.js';
import { remainingFrom, receiverFilterOptions, stripGalleryPrices } from '../application/presenters.js';
import { listGiftItems } from '../infrastructure/giftItemRepo.js';
import { rawPathToken, withGiftErrors } from './giftErrors.js';

export const giftReceiverGalleryRouter = Router();

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const MAX_FEED_IDS = 200;

function parseLimit(raw: unknown, fallback: number, max: number): number {
  const value = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

function parseCsv(raw: unknown, maxItems = 20, maxItemLength = 80): string[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const items = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= maxItemLength);
  if (items.length === 0) return undefined;
  return items.slice(0, maxItems);
}

function parsePriceBound(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

giftReceiverGalleryRouter.get('/:token/gallery/feed', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const items = await listGiftItems(pool, offer.id);
    const remaining = remainingFrom(offer, items).remainingBudget;
    const ids = parseCsv(req.query.ids, MAX_FEED_IDS, 80);
    const params: GalleryFeedParams = {
      cursor:
        typeof req.query.cursor === 'string'
          ? boundedPrintable(req.query.cursor, config.fieldLimits.galleryCursorMax)
          : undefined,
      limit: parseLimit(req.query.limit, DEFAULT_LIMIT, ids ? Math.max(MAX_LIMIT, ids.length) : MAX_LIMIT),
      occasion: parseCsv(req.query.occasion, 20, 80),
      shape: parseCsv(req.query.shape, 20, 40),
      length: parseCsv(req.query.length, 10, 40),
      size: (() => {
        const sizes = parseCsv(req.query.size, 4, 2)?.filter(
          (value) => value === 'XS' || value === 'S' || value === 'M' || value === 'L',
        );
        return sizes && sizes.length > 0 ? sizes : undefined;
      })(),
      ids,
      // Cart hydration by `ids` must still resolve a line that just sold out.
      // Browsing stays in-stock only, with remaining budget as maxPrice.
      ...(ids ? {} : { stock: 'in' as const }),
    };
    if (!ids) {
      // `listGalleryFeed` only applies a price clause when both bounds are
      // set. Remaining budget is the inclusive max; `minPrice` 0 is the
      // matching lower bound so unaffordable sets drop out of browsing.
      if (remaining != null) {
        const remainingMax = Math.max(0, remaining);
        const minPrice = offer.hideReceiverPrices ? 0 : (parsePriceBound(req.query.minPrice) ?? 0);
        const requestedMax = offer.hideReceiverPrices ? undefined : parsePriceBound(req.query.maxPrice);
        params.maxPrice = Math.min(requestedMax ?? remainingMax, remainingMax);
        params.minPrice = Math.min(minPrice, params.maxPrice);
      } else if (!offer.hideReceiverPrices) {
        const minPrice = parsePriceBound(req.query.minPrice);
        const requestedMax = parsePriceBound(req.query.maxPrice);
        if (minPrice != null) params.minPrice = minPrice;
        if (requestedMax != null) params.maxPrice = requestedMax;
      }
    }
    const result = await listGalleryFeed(pool, config.publicMediaUrl, params, requestLanguage(req));
    const mapped = offer.hideReceiverPrices ? result.items.map(stripGalleryPrices) : result.items;
    res.json({ success: true, items: mapped, nextCursor: result.nextCursor, totalCount: result.totalCount });
  });
});

giftReceiverGalleryRouter.get('/:token/gallery/filters', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const items = await listGiftItems(pool, offer.id);
    const remaining = remainingFrom(offer, items).remainingBudget;
    const flags = await outOfStockDisplayFlags();
    const options = await listFilterOptions(pool, requestLanguage(req), flags.outOfStockEnabled, 'nail');
    res.json({
      success: true,
      options: { ...receiverFilterOptions(options, offer.hideReceiverPrices, remaining), ...flags },
    });
  });
});

giftReceiverGalleryRouter.get('/:token/gallery/set/:uid', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token || !isProductUid(req.params.uid ?? '')) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const item = await getProductByUid(pool, config.publicMediaUrl, req.params.uid, requestLanguage(req));
    if (!item || !isGalleryItemPubliclyAccessible(item, await outOfStockProductsEnabled())) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, item: offer.hideReceiverPrices ? stripGalleryPrices(item) : item });
  });
});
