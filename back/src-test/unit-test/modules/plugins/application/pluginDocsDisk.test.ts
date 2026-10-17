import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginsDirectory } from '../../../../../src/modules/plugins/application/discoverPlugins.js';
import { SHIPPED_PLUGINS } from '../../../../../src/modules/plugins/application/catalog.js';

test('every disk plugin ships docs/handbook.json', async () => {
  const root = pluginsDirectory();
  const names = (await readdir(root)).filter((name) => !name.startsWith('.'));
  const folders: string[] = [];
  for (const name of names) {
    if ((await stat(join(root, name))).isDirectory()) folders.push(name);
  }
  assert.ok(folders.length >= 21, `expected shipped plugins, got ${folders.length}`);
  for (const id of folders) {
    const text = await readFile(join(root, id, 'docs', 'handbook.json'), 'utf8');
    const body = JSON.parse(text) as { title?: string; summary?: string };
    assert.ok(body.title, id);
    assert.ok(body.summary, id);
  }
});

test('shipped manifests declare engines.core on this 1.x kernel', () => {
  for (const plugin of SHIPPED_PLUGINS) {
    assert.equal(plugin.engines?.core, '>=1.0.0 <2.0.0', plugin.id);
  }
});

test('docs-developer ships the core handbook and loyalty example', async () => {
  const text = await readFile(
    join(pluginsDirectory(), 'docs-developer', 'docs', 'articles.json'),
    'utf8',
  );
  const body = JSON.parse(text) as { articles: Array<{ id: string; group: string }> };
  const ids = new Set(body.articles.map((article) => article.id));
  for (const id of [
    'architecture',
    'core-openings',
    'permissions',
    'plugin-to-plugin',
    'versioning',
    'example-profile',
    'example-courier',
    'example-loyalty',
    'example-permissions',
  ]) {
    assert.ok(ids.has(id), id);
  }
  assert.ok(body.articles.some((article) => article.group === 'core'));
  assert.ok(body.articles.some((article) => article.group === 'examples'));
});
