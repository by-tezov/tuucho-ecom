import type { NextFunction, Request, Response } from 'express';

/**
 * API-origin crawler policy (`/robots.txt` on the JSON host).
 *
 * Storefront-origin robots are assembled by the kernel SEO engine
 * (`GET /storefront/robots.txt`): Allow + Sitemap on APP_TARGET=prod,
 * otherwise Disallow: /. Shop-host `kernel/front/public/robots.txt` is the
 * static non-prod default (Disallow: /); prod prerender overwrites dist.
 * This file must not mount shop robots at `/robots.txt` here, or it would
 * shadow the API crawler policy.
 *
 * The API answers on its own subdomain (api./preprod-api.shop.example), so it
 * is a crawlable site in its own right and Google treats it as one: Search
 * Console reports `https://api.shop.example/` under "Not found (404)" because
 * it went looking and there was nothing to find, not even a robots.txt.
 *
 * The JSON endpoints and the link-preview shim at /gallery/set/:uid/preview
 * must never be indexed: they are machine surfaces, and an indexed preview
 * shim would compete with the real product page on the shop's own domain.
 * That is the job of the `X-Robots-Tag: noindex` header below, not of
 * robots.txt, which deliberately allows everything:
 *
 * - Google renders the shop's pages, and its renderer applies THIS host's
 *   robots.txt to every fetch() those pages make. A `Disallow: /` here failed
 *   every catalogue request for Googlebot: the front's /healthz probe then
 *   reported the backend down and every page rendered as the home page, and a
 *   product page never got past its skeleton.
 * - A crawler only sees a noindex header on a URL it is allowed to fetch. A
 *   disallowed URL that is linked from elsewhere can still be indexed from
 *   the link alone, without its content.
 *
 * /media is exempt from the header: in prod and preprod Apache serves the
 * catalogue photos straight from the front's docroot (URL_PUBLIC_MEDIA), so
 * nothing under it is served from here, but the exemption means the rule
 * cannot quietly de-index the catalogue photos if that ever moves back behind
 * Node (see app.ts's /media mount).
 */

/** The one prefix that may be indexed: the catalogue photo store, served
 * from here only as a local-dev fallback. */
const INDEXABLE_PREFIX = '/media/';

const ROBOTS_TXT = `User-agent: *
Disallow:
`;

/** `X-Robots-Tag: noindex` on everything but the photos. */
export function noindexExceptMedia(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith(INDEXABLE_PREFIX)) {
    res.setHeader('X-Robots-Tag', 'noindex');
  }
  next();
}

/** Serves /robots.txt so the crawler gets an answer instead of a 404. */
export function robotsTxt(_req: Request, res: Response): void {
  res.type('text/plain').send(ROBOTS_TXT);
}
