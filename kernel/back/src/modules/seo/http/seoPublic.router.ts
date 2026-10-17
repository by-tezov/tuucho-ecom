import { Router } from 'express';
import { lookupAppliedRedirect, shopRobotsText, sitemapXml } from '../application/seoEngine.js';

export const seoPublicRouter = Router();

seoPublicRouter.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const xml = await sitemapXml();
    if (xml == null) {
      res.status(404).type('text/plain').send('Sitemap is not published on this environment.\n');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('application/xml').send(xml);
  } catch (error) {
    next(error);
  }
});

seoPublicRouter.get('/storefront/robots.txt', async (_req, res, next) => {
  try {
    res.type('text/plain').send(await shopRobotsText());
  } catch (error) {
    next(error);
  }
});

/** After plugins are loaded: live 301/410 apply. */
export const seoRedirectRouter = Router();

seoRedirectRouter.use(async (req, res, next) => {
  try {
    const hit = await lookupAppliedRedirect(req.path);
    if (!hit) {
      next();
      return;
    }
    if (hit.status === 410) {
      res.status(410).end();
      return;
    }
    res.redirect(hit.status || 301, hit.toPath);
  } catch {
    next();
  }
});
