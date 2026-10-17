import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleRobotsText,
  dedupeSitemapEntries,
  findRedirect,
  KERNEL_SITEMAP_PATHS,
  normalizeRedirectInput,
  renderSitemapXml,
} from '../../../../../src/modules/seo/application/assembleSeo.js';
import {
  isPublicSeoTarget,
  PRIVATE_SEO_ROBOTS,
  PRIVATE_SEO_ROBOTS_TXT,
  PUBLIC_SEO_ROBOTS,
} from '../../../../../src/config/publicSeo.js';

test('sitemap XML includes loc, lastmod, and skips duplicate loc', () => {
  const xml = renderSitemapXml([
    { loc: 'https://shop.example/home', lastmod: '2026-10-01', source: 'page' },
    { loc: 'https://shop.example/home', source: 'dup' },
    { loc: 'https://shop.example/gallery' },
  ]);
  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.equal(xml.match(/<loc>/g)?.length, 2);
  assert.match(xml, /<lastmod>2026-10-01<\/lastmod>/);
});

test('dedupeSitemapEntries keeps the first source', () => {
  const rows = dedupeSitemapEntries([
    { loc: 'https://shop.example/a', source: 'kernel' },
    { loc: 'https://shop.example/a', source: 'plugin' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source, 'kernel');
});

test('public SEO is on only for prod', () => {
  assert.equal(isPublicSeoTarget('prod'), true);
  assert.equal(isPublicSeoTarget('dev'), false);
  assert.equal(isPublicSeoTarget('preprod'), false);
  assert.equal(isPublicSeoTarget('production'), false);
  assert.equal(isPublicSeoTarget(''), false);
});

test('robots text always allows / and ends with Sitemap', () => {
  const text = assembleRobotsText(
    [
      { directive: 'Disallow', value: '/admin' },
      { directive: 'Disallow', value: '/account' },
    ],
    'https://shop.example/sitemap.xml',
  );
  assert.match(text, /^User-agent: \*\nAllow: \/\nDisallow: \/admin\nDisallow: \/account\n\nSitemap: https:\/\/shop.example\/sitemap.xml\n$/);
});

test('non-prod robots disallow everything and ignore extra rules and sitemap', () => {
  const text = assembleRobotsText(
    [{ directive: 'Disallow', value: '/admin' }],
    'https://shop.example/sitemap.xml',
    false,
  );
  assert.equal(text, PRIVATE_SEO_ROBOTS_TXT);
  assert.doesNotMatch(text, /Sitemap:/);
  assert.doesNotMatch(text, /Allow: \//);
  assert.equal(PRIVATE_SEO_ROBOTS, 'noindex, nofollow');
  assert.equal(PUBLIC_SEO_ROBOTS, 'index, follow');
});

test('findRedirect prefers stored rows then extra rules', () => {
  const hit = findRedirect(
    '/old',
    [{ fromPath: '/old', toPath: '/new', status: 301, source: 'kernel:table' }],
    [{ fromPath: '/old', toPath: '/other', status: 301, source: 'plugin' }],
  );
  assert.equal(hit?.toPath, '/new');
  assert.equal(findRedirect('/missing', [], []), null);
});

test('kernel sitemap paths are kernel pages, not plugin extras', () => {
  const paths: readonly string[] = KERNEL_SITEMAP_PATHS;
  assert.ok(paths.includes('/gallery'));
  assert.equal(paths.includes('/accessibility'), false);
  assert.equal(paths.includes('/contact'), false);
  assert.equal(paths.includes('/pose'), false);
  assert.equal(paths.includes('/capsules'), false);
});

test('normalizeRedirectInput rejects paths that are not absolute', () => {
  const bad = normalizeRedirectInput('old', '/new', 301);
  assert.ok('error' in bad);
  assert.deepEqual(normalizeRedirectInput('/old', '/new', 301), {
    fromPath: '/old',
    toPath: '/new',
    status: 301,
  });
  assert.deepEqual(normalizeRedirectInput('/gone', '', 410), {
    fromPath: '/gone',
    toPath: '/',
    status: 410,
  });
});
