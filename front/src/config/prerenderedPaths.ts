/**
 * The **static** route paths scripts/prerender.mjs produces a snapshot for
 * (see entry-server.tsx's `pages`, the source of truth this list mirrors).
 * This is the whole prerendered surface: the per-set product pages are
 * never built here, by rule — the catalogue is database-backed, so every
 * product URL is served dynamically (see entry-server.tsx's note).
 *
 * This is no longer what decides whether the client hydrates — that now
 * reads the payload scripts/prerender.mjs embeds in each page, which names
 * the exact route its markup was built for.
 */
export const PRERENDERED_PATHS: readonly string[] = [
  '/',
  '/home',
  '/gallery',
  '/about',
  '/contact',
  '/capsules',
  '/pose',
  '/sizes',
  '/legal',
  '/privacy',
  '/terms',
  '/sales-terms',
  '/sitemap',
];
