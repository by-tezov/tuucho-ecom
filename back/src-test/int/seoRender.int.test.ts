/**
 * The server-rendered catalogue surfaces, against the real app and database.
 *
 * What these pin is the reason the routes exist: before them, every
 * `/creations/<uid>` URL was served by the SPA fallback, which is the
 * prerendered `/` splash and carries `noindex`. A unit test cannot show that
 * the markup a crawler receives actually names the set, carries an indexable
 * head and links to a real product URL, because all three are assembled from
 * database rows.
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, resetDatabase } from './support/stack.js';
import { createProduct } from './support/fixtures.js';

const RELAY = { 'x-pamsurin-ssr-relay': '1' };

/** Must match PRODUCT_UID_PATTERN, unlike the fixture's own default. */
const UID = 'IN-TA-123';

// beforeEach, not before: `npm run test:int` runs every file in one process
// (--experimental-test-isolation=none), so another file's own reset can land
// between a top-level `before` here and these tests.
beforeEach(async () => {
  await resetDatabase();
  await createProduct({ productUid: UID, price: 32 });
});

test('both routes are relay-only, so the catalogue is not crawlable on the API host', async () => {
  for (const path of ['/seo/gallery', `/seo/product/${UID}`]) {
    const response = await api(path === '/seo/gallery' ? 'GET' : 'GET', path);
    assert.equal(response.status, 410, `${path} must refuse a direct request`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('the gallery document carries an indexable head and a real anchor per set', async () => {
  const response = await api<{ title: string; head: string; body: string }>('GET', '/seo/gallery?lang=fr', {
    headers: RELAY,
    expectStatus: 200,
  });
  const { title, head, body } = response.body;

  assert.match(title, /Lumen Atelier/);
  assert.match(head, /<meta name="robots" content="index, follow" \/>/);
  assert.match(head, /<link rel="canonical" href="[^"]*\/fr\/gallery"/);
  assert.match(head, /hreflang="x-default"/);
  assert.match(head, /"@type":"CollectionPage"/);
  assert.match(head, /"@type":"ItemList"/);

  // The point of the page: a crawlable link to the product, which nothing on
  // the site offered before (the grid is client-side, and the sitemap carries
  // no anchor text).
  assert.match(body, /<h1>/);
  assert.match(body, new RegExp(`href="[^"]*/fr/creations/${UID.toLowerCase()}"`));
  assert.match(body, /Set IN-TA-123/);
  assert.match(body, /32,00/);
});

test('the product document declares itself indexable and describes the set', async () => {
  const response = await api<{ title: string; head: string; body: string }>(
    'GET',
    `/seo/product/${UID}?lang=fr`,
    { headers: RELAY, expectStatus: 200 },
  );
  const { title, head, body } = response.body;

  assert.match(title, /Set IN-TA-123/);
  assert.match(head, /<meta name="robots" content="index, follow" \/>/);
  assert.match(head, new RegExp(`<link rel="canonical" href="[^"]*/fr/creations/${UID.toLowerCase()}"`));
  assert.match(head, /"@type":"Product"/);
  assert.match(head, /"@type":"Offer"/);
  assert.match(head, /"price":"32.00"/);
  assert.match(head, /schema\.org\/InStock/);
  assert.match(head, /"@type":"BreadcrumbList"/);
  assert.match(body, /<h1>Set IN-TA-123<\/h1>/);
});

test('the locale follows ?lang=, not the caller', async () => {
  const fr = await api<{ head: string }>('GET', `/seo/product/${UID}?lang=fr`, {
    headers: RELAY,
    expectStatus: 200,
  });
  const en = await api<{ head: string }>('GET', `/seo/product/${UID}?lang=en`, {
    headers: { ...RELAY, 'accept-language': 'fr-FR' },
    expectStatus: 200,
  });
  assert.match(fr.body.head, /href="[^"]*\/fr\/creations\//);
  assert.match(en.body.head, /href="[^"]*\/en\/creations\//);
});

test('an unknown set is a no-store 404, so the relay cannot cache a page that should vanish', async () => {
  const response = await api('GET', '/seo/product/ZZ-ZZ-999', { headers: RELAY });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('a malformed code is rejected before it reaches the database', async () => {
  const response = await api('GET', '/seo/product/not-a-uid', { headers: RELAY });
  assert.equal(response.status, 404);
});

/** Regression: `products.occasion` is nullable, but assembleItems localized it
 * unguarded, so a set imported without one threw `null.fr` and took the
 * gallery feed, getProductByUid and cart hydration down with it. The fixture
 * creates exactly such a set, which is how it surfaced. */
test('a set with no occasion does not break the catalogue', async () => {
  const feed = await api<{ items: { productUid: string }[] }>('GET', '/gallery/feed?limit=10', {
    expectStatus: 200,
  });
  assert.ok(
    feed.body.items.some((item) => item.productUid === UID),
    'the occasion-less set must appear in the feed',
  );
});
