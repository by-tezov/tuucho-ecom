import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadManifests } from '../../../../../src/modules/plugins/application/catalog.js';

test('every disk plugin ships docs/handbook.json', async () => {
  const plugins = await loadManifests();
  assert.ok(plugins.length >= 21, `expected shipped plugins, got ${plugins.length}`);
  for (const plugin of plugins) {
    assert.ok(plugin.sourceDir, plugin.id);
    const text = await readFile(join(plugin.sourceDir, 'docs', 'handbook.json'), 'utf8');
    const body = JSON.parse(text) as {
      title?: string;
      summary?: string;
      sections?: Array<{ heading?: string; blocks?: unknown[] }>;
    };
    assert.ok(body.title, plugin.id);
    assert.ok(body.summary, plugin.id);
    if (plugin.kind === 'locale') continue;
    assert.ok(body.sections && body.sections.length > 0, plugin.id);
    assert.ok(
      body.sections.every((section) => section.heading && section.blocks && section.blocks.length > 0),
      plugin.id,
    );
  }
});

test('disk manifests declare engines.core on this 1.x kernel', async () => {
  const plugins = await loadManifests();
  assert.ok(plugins.length >= 21, `expected bundled plugins, got ${plugins.length}`);
  for (const plugin of plugins) {
    if (plugin.id.startsWith('demo-')) continue;
    assert.equal(plugin.engines?.core, '>=1.0.0 <2.0.0', plugin.id);
  }
});

test('docs-developer ships the core handbook and loyalty example', async () => {
  const plugins = await loadManifests();
  const docs = plugins.find((plugin) => plugin.id === 'tuucho-docs-developer');
  assert.ok(docs?.sourceDir, 'tuucho-docs-developer');
  const text = await readFile(join(docs.sourceDir, 'docs', 'articles.json'), 'utf8');
  const body = JSON.parse(text) as {
    articles: Array<{
      id: string;
      title: string;
      group: string;
      sections: Array<{ heading: string; blocks?: unknown[]; paragraphs?: unknown[] }>;
    }>;
  };
  const ids = new Set(body.articles.map((article) => article.id));
  for (const id of [
    'architecture',
    'kernel-register',
    'core-openings',
    'front-slots',
    'kernel-ui',
    'permissions',
    'contact',
    'kernel-surfaces',
    'locales',
    'extend-seo',
    'plugin-to-plugin',
    'versioning',
    'example-profile',
    'example-courier',
    'example-loyalty',
    'example-permissions',
    'example-spy-channel',
  ]) {
    assert.ok(ids.has(id), id);
  }
  assert.equal(
    body.articles.filter((article) => article.id === 'extend-seo').length,
    1,
  );
  assert.ok(body.articles.every((article) => article.title !== 'Documentation'));
  const titles = body.articles.map((article) => article.title);
  assert.equal(titles.length, new Set(titles).size);
  assert.ok(body.articles.some((article) => article.group === 'start'));
  assert.ok(body.articles.some((article) => article.group === 'kernel'));
  assert.ok(body.articles.some((article) => article.group === 'extend'));
  assert.ok(body.articles.some((article) => article.group === 'examples'));
  const blockTypes = new Set<string>();
  for (const article of body.articles) {
    for (const section of article.sections) {
      assert.ok(section.blocks && section.blocks.length > 0, article.id);
      for (const block of section.blocks as Array<{ type?: string }>) {
        if (block.type) blockTypes.add(block.type);
      }
    }
  }
  for (const type of ['callout', 'cards', 'steps', 'table', 'defs', 'code']) {
    assert.ok(blockTypes.has(type), type);
  }
  const contact = body.articles.find((article) => article.id === 'contact');
  assert.ok(contact, 'contact');
  const contactBlob = JSON.stringify(contact);
  assert.ok(contactBlob.includes('POST /contact'), 'contact form route');
  assert.ok(contactBlob.includes('unconnected_contacts'), 'contact storage');
  assert.ok(contactBlob.includes('messages'), 'contact permission');
});

test('FAQ handbook explains slot, entry shape, and how to add items', async () => {
  const plugins = await loadManifests();
  const faq = plugins.find((plugin) => plugin.id === 'tuucho-home-faq');
  assert.ok(faq?.sourceDir, 'tuucho-home-faq');
  const text = await readFile(join(faq.sourceDir, 'docs', 'handbook.json'), 'utf8');
  const blob = text;
  assert.ok(blob.includes('slot.home.faq'));
  assert.ok(blob.includes('t.faq.items') || blob.includes('faq.items'));
  assert.ok(blob.includes('{ q, a }') || blob.includes('{ q: string, a: string }'));
});

test('visible handbook titles are unique among non-locale plugins', async () => {
  const plugins = await loadManifests();
  const titles: string[] = [];
  for (const plugin of plugins) {
    if (plugin.kind === 'locale' || !plugin.sourceDir) continue;
    if (plugin.id === 'tuucho-docs-developer') continue;
    const text = await readFile(join(plugin.sourceDir, 'docs', 'handbook.json'), 'utf8');
    const body = JSON.parse(text) as { title?: string };
    assert.ok(body.title, plugin.id);
    titles.push(body.title);
  }
  assert.equal(titles.length, new Set(titles).size, String(titles));
});
