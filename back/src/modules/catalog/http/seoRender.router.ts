import { Router, type Request } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { getProductByUid } from '../application/products.js';
import { listGallerySeoIndex, listRelatedSeoSets } from '../application/gallerySeoQuery.js';
import { gallerySeoDocument, productSeoDocument } from '../application/seoDocument.js';
import { isLanguage, requestLanguage, type Language } from '../../../utils/language.js';
import {
  isGalleryItemPubliclyAccessible,
  outOfStockProductsEnabled,
} from '../application/outOfStockVisibility.js';
import { PRODUCT_UID_PATTERN } from '../domain/productUid.js';

/**
 * Server-rendered head and body for the two catalogue surfaces the static
 * front cannot prerender, consumed by the shop host's PHP relay
 * (pamsurin-front's `public/ssr.php`).
 *
 * The relay reads a prerendered shell off its own disk and substitutes the
 * three placeholders this returns, so a crawler gets a complete document
 * from the shop origin rather than a redirect to this API. That matters: the
 * canonical must stay on pamsurin.fr, and the existing
 * /gallery/set/:uid/preview route (a 302 for link-preview bots only) was
 * never suitable for a search crawler for exactly that reason.
 *
 * JSON rather than HTML: the relay owns the document, this owns the parts.
 *
 * Same access discriminator as /sitemap-products.xml. It is not a secret,
 * since every byte it returns is public at the shop URL; it keeps a second
 * crawlable copy of the catalogue off the API origin.
 */
export const seoRenderRouter = Router();

const RELAY_HEADER = 'X-Lumen-Ssr-Relay';

/** Five minutes, matching the LsCache policy the shop host applies to
 * /gallery and the relay's own file cache. */
const CACHE_CONTROL = 'public, max-age=300';

function relayLanguage(req: Request): Language {
  const language = typeof req.query.lang === 'string' ? req.query.lang.toLowerCase() : undefined;
  return typeof language === 'string' && isLanguage(language) ? language : requestLanguage(req);
}

/** A direct request gets 410, so neither Google nor a visitor can reach a
 * second copy of the catalogue on the API host. */
function relayOnly(req: Request, res: import('express').Response): boolean {
  res.vary(RELAY_HEADER);
  if (req.get(RELAY_HEADER) === '1') return true;
  res.setHeader('Cache-Control', 'no-store');
  res.status(410).type('text').send('Gone');
  return false;
}

seoRenderRouter.get('/seo/gallery', async (req, res) => {
  if (!relayOnly(req, res)) return;
  const language = relayLanguage(req);
  const rows = await listGallerySeoIndex(
    pool,
    config.publicMediaUrl,
    language,
    !(await outOfStockProductsEnabled()),
  );
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.json(gallerySeoDocument(rows, language));
});

seoRenderRouter.get('/seo/product/:uid', async (req, res) => {
  if (!relayOnly(req, res)) return;
  const language = relayLanguage(req);
  const uid = req.params.uid;
  if (!PRODUCT_UID_PATTERN.test(uid)) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ error: 'not-found' });
    return;
  }
  const item = await getProductByUid(pool, config.publicMediaUrl, uid, language);
  if (!item || !isGalleryItemPubliclyAccessible(item, await outOfStockProductsEnabled())) {
    // A hidden or deleted set must not keep a 200 alive in the relay's file
    // cache, and the relay turns this into a real 404 for the crawler.
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ error: 'not-found' });
    return;
  }
  const related = await listRelatedSeoSets(
    pool,
    config.publicMediaUrl,
    language,
    item.id,
    8,
    !(await outOfStockProductsEnabled()),
  );
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.json(productSeoDocument(item, language, related));
});

