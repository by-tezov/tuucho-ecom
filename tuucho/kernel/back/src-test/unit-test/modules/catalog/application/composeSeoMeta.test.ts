import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeJsonLdGraph, composeSeoMeta } from '../../../../../src/modules/catalog/application/seoJsonLd.js';
import { PRIVATE_SEO_ROBOTS } from '../../../../../src/config/publicSeo.js';
import { config } from '../../../../../src/config/env.js';

test('composeSeoMeta forces noindex outside prod even if a plugin asks to index', async () => {
  assert.notEqual(config.target, 'prod');
  const meta = await composeSeoMeta({
    title: 'Page',
    robots: 'index, follow',
    sitemap: 'https://shop.example/sitemap.xml',
  });
  assert.equal(meta.robots, PRIVATE_SEO_ROBOTS);
  assert.equal(meta.sitemap, undefined);
});

test('composeJsonLdGraph is empty outside prod', async () => {
  assert.notEqual(config.target, 'prod');
  const graph = await composeJsonLdGraph([{ '@type': 'Organization' }]);
  assert.deepEqual(graph, []);
});
