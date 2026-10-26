import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import {
  listFeaturedItems,
  listFilterOptions,
  listGalleryFeed,
  getProductsByIds,
  getProductByUid,
  listCartAccessories,
} from '../application/products.js';
import type { GalleryFeedParams } from '../application/products.js';
import { giftRuleProductUid, listCartRules } from '../../plugins/application/pluginBridges.js';
import { requestLanguage } from '../../../utils/language.js';
import { boundedPrintable } from '../../../utils/fieldLimits.js';
import { optionalAuth } from '../../../middleware/optionalAuth.js';
import {
  isGalleryItemPubliclyAccessible,
  outOfStockDisplayFlags,
  outOfStockProductsEnabled,
  resolveGalleryFeedStock,
} from '../application/outOfStockVisibility.js';

import { isProductUid } from '../domain/productUid.js';

export const galleryCatalogRouter = Router();

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const DEFAULT_FEATURED_LIMIT = 10;
/** Same reasoning as MAX_FEED_IDS below, for the sibling call the cart makes
 * in the same breath: loadProducts asks for every missing id at once, and
 * CartPage/CartControl gate a line's whole render on its ProductById. 40 was
 * only ever a guess at "a big cart". */
const MAX_PRODUCT_IDS = 200;
/** Cap on `?ids=` for the feed. Far higher than MAX_PRODUCT_IDS because this
 * one is not a browsing page size: the front resolves a whole cart (and the
 * whole favorites list) through it in a single call, and anything dropped
 * here disappears from the cart page *and* from its subtotal without an
 * error (CartPage builds its nail lines by discarding items whose gallery
 * set is missing). parseCsv's default of 20 silently did exactly that. Still
 * bounded — non-uuid entries are filtered out before the query (see
 * buildFeedWhere), so the array only ever reaches Postgres as `uuid[]`. */
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

galleryCatalogRouter.get('/gallery/feed', optionalAuth, async (req, res) => {
  const language = requestLanguage(req);
  const ids = parseCsv(req.query.ids, MAX_FEED_IDS, 80);
  const params: GalleryFeedParams = {
    cursor:
      typeof req.query.cursor === 'string'
        ? boundedPrintable(req.query.cursor, config.fieldLimits.galleryCursorMax)
        : undefined,
    // MAX_LIMIT is the *browsing* page size. An explicit id list is a closed
    // set the caller already named, so it may resolve in one page — otherwise
    // a cart of more than 60 nails would page, and neither cart surface pages.
    limit: parseLimit(req.query.limit, DEFAULT_LIMIT, ids ? Math.max(MAX_LIMIT, ids.length) : MAX_LIMIT),
    occasion: parseCsv(req.query.occasion, 20, 80),
    shape: parseCsv(req.query.shape, 20, 40),
    length: parseCsv(req.query.length, 10, 40),
    // Only the closed nail-size vocabulary — drop anything else so a typo
    // cannot widen the filter into an accidental no-op or SQL surprise.
    size: (() => {
      const sizes = parseCsv(req.query.size, 4, 2)?.filter(
        (value) => value === 'XS' || value === 'S' || value === 'M' || value === 'L',
      );
      return sizes && sizes.length > 0 ? sizes : undefined;
    })(),
    ids,
    userId: req.user?.id,
    userLibraryOnly: req.query.userLibraryOnly === 'true',
    // Cart hydration by `ids` omits `stock` so a sold-out line still resolves.
    // The Boutique toggle otherwise forces in-stock for every browsing call.
    stock: resolveGalleryFeedStock(req.query.stock, Boolean(ids), await outOfStockProductsEnabled()),
    minPrice: parsePriceBound(req.query.minPrice),
    maxPrice: parsePriceBound(req.query.maxPrice),
  };
  const result = await listGalleryFeed(pool, config.publicMediaUrl, params, language);
  if (req.user) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.append('Vary', 'Authorization');
  }
  res.json(result);
});

galleryCatalogRouter.get('/gallery/featured', async (req, res) => {
  const language = requestLanguage(req);
  const limit = parseLimit(req.query.limit, DEFAULT_FEATURED_LIMIT, MAX_LIMIT);
  const inStockOnly = !(await outOfStockProductsEnabled());
  const items = await listFeaturedItems(pool, config.publicMediaUrl, limit, language, inStockOnly);
  res.json(items);
});

/** One public catalogue set for `/creations/<uid>`. An older
 * `/creations/<title>-<uid>` link still resolves: the front reads the uid off
 * the end of the slug before calling this. */
galleryCatalogRouter.get('/gallery/set/:uid', async (req, res) => {
  const uid = req.params.uid;
  if (!isProductUid(uid)) {
    res.status(404).json({ success: false, error: { code: 'unknown_product' } });
    return;
  }
  const item = await getProductByUid(pool, config.publicMediaUrl, uid, requestLanguage(req));
  if (!item || !isGalleryItemPubliclyAccessible(item, await outOfStockProductsEnabled())) {
    res.status(404).json({ success: false, error: { code: 'unknown_product' } });
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(item);
});

galleryCatalogRouter.get('/gallery/filter-options', async (req, res) => {
  const flags = await outOfStockDisplayFlags();
  const productType = req.query.productType === 'nail_single' ? 'nail_single' : 'nail';
  const options = await listFilterOptions(pool, requestLanguage(req), flags.outOfStockEnabled, productType);
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ ...options, ...flags });
});

/** Cart hydration for nails + accessories by product id. `available` is a
 * shape→size map for nails and a scalar number for accessories. */
galleryCatalogRouter.get('/gallery/products', optionalAuth, async (req, res) => {
  const ids = parseCsv(req.query.ids, MAX_PRODUCT_IDS, 40);
  if (!ids) {
    res.status(400).json({ success: false, error: { code: 'ids_required' } });
    return;
  }
  const products = await getProductsByIds(
    pool,
    config.publicMediaUrl,
    ids,
    requestLanguage(req),
    req.user?.id,
  );
  if (req.user) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.append('Vary', 'Authorization');
  }
  res.json(products);
});

/** Visible accessories flagged for the cart-page “Ajoutez des accessoires”
 * carousel. Empty array is fine — the front hides the track. */
galleryCatalogRouter.get('/gallery/cart-accessories', async (req, res) => {
  const items = await listCartAccessories(pool, config.publicMediaUrl, requestLanguage(req));
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(items);
});

/** Enabled permanent cart-rule params for client-side progress/franco preview.
 * Checkout pricing remains authoritative in priceCheckout. */
galleryCatalogRouter.get('/gallery/cart-rules', async (_req, res) => {
  const rows = await listCartRules(pool);
  // A guest cart lives only in the browser, so it needs the resolved product
  // id to render the same gift preview that the server later creates after
  // the cart is imported into an account. Resolve every enabled gift rule in
  // one query; an absent product deliberately produces no client preview,
  // matching syncGiftLinesForCart's behaviour.
  const giftProductUids: string[] = [];
  for (const row of rows) {
    const productUid = row.enabled ? await giftRuleProductUid(row) : null;
    if (productUid) giftProductUids.push(productUid);
  }
  const { rows: giftProducts } =
    giftProductUids.length === 0
      ? { rows: [] as Array<{ id: string; product_uid: string }> }
      : await pool.query<{ id: string; product_uid: string }>(
          `select id, product_uid from products where product_uid = any($1::text[])`,
          [giftProductUids],
        );
  const giftProductIdByUid = new Map(
    giftProducts.map((product) => [product.product_uid.toUpperCase(), product.id]),
  );
  res.setHeader('Cache-Control', 'public, max-age=30');
  const rules = [];
  for (const row of rows.filter((entry) => entry.enabled)) {
    const productUid = await giftRuleProductUid(row);
    const giftProductId = productUid ? giftProductIdByUid.get(productUid.toUpperCase()) : undefined;
    rules.push({
      code: row.code,
      kind: row.kind,
      priority: row.priority,
      forbidVoucher: row.forbid_voucher,
      params: row.params,
      ...(giftProductId ? { giftProductId } : {}),
    });
  }
  res.json({ success: true, rules });
});
