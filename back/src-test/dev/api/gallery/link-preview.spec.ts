import { test, expect } from 'patchright/test';
import { apiJson } from '../../support/api.js';
import { E2E_PRODUCT_UIDS, E2E_TITLES } from '../../support/catalog.js';

/** The three public gallery routes that do not answer JSON: the crawler
 * preview, the live product sitemap, and the cart carousel array. */
test.describe('API gallery link preview and sitemap', () => {
  test('set preview: serves Open Graph HTML for a real uid and a generic 404 preview otherwise', async ({ request }) => {
    const uid = E2E_PRODUCT_UIDS.A1;
    const response = await request.get(`/gallery/set/${encodeURIComponent(uid)}/preview?lang=fr`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(response.headers()['cache-control']).toContain('max-age=300');

    const html = await response.text();
    expect(html).toContain('og:title');
    expect(html).toContain(E2E_TITLES[E2E_PRODUCT_UIDS.A1]);
    // Canonical points at the front's product route, lowercased; a real
    // browser is redirected to the gallery deep link instead. `?lang=` is
    // authoritative for the `/xx` prefix, including French.
    expect(html).toContain(`/fr/creations/${uid.toLowerCase()}`);
    expect(html).toContain(`/fr/gallery?product=${uid}`);

    const english = await request.get(`/gallery/set/${encodeURIComponent(uid)}/preview?lang=en`);
    expect(english.status()).toBe(200);
    const englishHtml = await english.text();
    expect(englishHtml).toContain(`/en/creations/${uid.toLowerCase()}`);
    expect(englishHtml).toContain(`/en/gallery?product=${uid}`);
    expect(englishHtml).not.toContain(`/fr/creations/${uid.toLowerCase()}`);

    // A malformed code never reaches a lookup, and an unknown well-formed one
    // must not leak the difference: both answer the same generic preview.
    for (const badUid of ['not-a-uid', 'ZZ-ZZ-999']) {
      const missing = await request.get(`/gallery/set/${encodeURIComponent(badUid)}/preview?lang=fr`);
      expect(missing.status()).toBe(404);
      expect(missing.headers()['content-type']).toContain('text/html');
      const body = await missing.text();
      expect(body).toContain('/fr/gallery');
      expect(body).not.toContain(`/creations/${badUid.toLowerCase()}`);
    }
  });

  test('sitemap-products.xml: serves the relay and hides user-library sets', async ({ request }) => {
    const directResponse = await request.get('/sitemap-products.xml');
    expect(directResponse.status()).toBe(410);
    expect(directResponse.headers()['cache-control']).toContain('no-store');

    const response = await request.get('/sitemap-products.xml', {
      headers: { 'X-Lumen-Sitemap-Relay': '1' },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');
    expect(response.headers()['cache-control']).toContain('max-age=300');

    const xml = await response.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    );
    expect(xml).toContain(`/fr/creations/${E2E_PRODUCT_UIDS.A1.toLowerCase()}`);
    expect(xml).toContain(`/en/creations/${E2E_PRODUCT_UIDS.A1.toLowerCase()}`);
    expect(xml).toContain('hreflang="x-default"');
    expect(xml).toContain('<lastmod>');
    // Product loc URLs are always locale-prefixed, including French.
    expect(xml).not.toMatch(/https?:\/\/[^/]+\/creations\//);
    // Private creations are not public URLs, so they must never be advertised
    // to crawlers even though they exist in the catalogue.
    expect(xml).not.toContain(`/creations/${E2E_PRODUCT_UIDS.USER_A.toLowerCase()}`);
    expect(xml).not.toContain(`/creations/${E2E_PRODUCT_UIDS.USER_B.toLowerCase()}`);
  });

  test('cart-accessories: returns the public carousel array', async ({ request }) => {
    const { status, body } = await apiJson<
      Array<{ id: string; productUid: string; title: string }>
    >(request, 'GET', '/gallery/cart-accessories', { expectedStatus: 200 });
    expect(status).toBe(200);
    // Deliberately an array, not the {success} envelope — same item shape as
    // GET /gallery/products?ids=. An empty track is a valid response.
    expect(Array.isArray(body)).toBe(true);
    for (const item of body) {
      expect(item.id).toBeTruthy();
      expect(item.productUid).toBeTruthy();
    }
  });
});
