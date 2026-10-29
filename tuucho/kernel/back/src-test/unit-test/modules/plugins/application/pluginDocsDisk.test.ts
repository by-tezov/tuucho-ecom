import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadManifests } from '../../../../../src/modules/plugins/application/catalog.js';
import {
  resolvePluginConfigDir,
  splitSchemaKeys,
} from '../../../../../src/modules/plugins/application/pluginConfigFiles.js';

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
    if (plugin.kinds.includes('locale')) continue;
    assert.ok(body.sections && body.sections.length > 0, plugin.id);
    assert.ok(
      body.sections.every((section) => section.heading && section.blocks && section.blocks.length > 0),
      plugin.id,
    );
  }
});

test('disk manifests declare engines.core on this 0.x product', async () => {
  const plugins = await loadManifests();
  assert.ok(plugins.length >= 21, `expected bundled plugins, got ${plugins.length}`);
  for (const plugin of plugins) {
    assert.equal(plugin.engines?.core, '>=0.0.1 <1.0.0', plugin.id);
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
    'config-files',
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
  const faq = plugins.find((plugin) => plugin.id === 'home-faq');
  assert.ok(faq?.sourceDir, 'home-faq');
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
    if (plugin.kinds.includes('locale') || !plugin.sourceDir) continue;
    if (plugin.id === 'tuucho-docs-developer') continue;
    const text = await readFile(join(plugin.sourceDir, 'docs', 'handbook.json'), 'utf8');
    const body = JSON.parse(text) as { title?: string };
    assert.ok(body.title, plugin.id);
    titles.push(body.title);
  }
  assert.equal(titles.length, new Set(titles).size, String(titles));
});

function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canon((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

test('schema plugins ship committed examples and matching handbook JSON blocks', async () => {
  const plugins = await loadManifests();
  for (const plugin of plugins) {
    const schema = plugin.settingsSchema;
    if (!schema || Object.keys(schema).length === 0) continue;
    const dir = resolvePluginConfigDir(plugin);
    assert.ok(dir, plugin.id);
    const publicPath = join(dir, 'config.json');
    const examplePath = join(dir, 'config.private.example.json');
    assert.equal(existsSync(publicPath), true, `${plugin.id} missing ${publicPath}`);
    const publicObj = JSON.parse(await readFile(publicPath, 'utf8')) as Record<string, unknown>;
    const { publicKeys, secretKeys } = splitSchemaKeys(schema);
    assert.deepEqual(Object.keys(publicObj).sort(), [...publicKeys].sort(), plugin.id);
    for (const key of secretKeys) {
      assert.equal(key in publicObj, false, `${plugin.id} secret ${key} in public file`);
    }
    const privateObj = secretKeys.length === 0
      ? null
      : (JSON.parse(await readFile(examplePath, 'utf8')) as Record<string, unknown>);
    if (secretKeys.length === 0) {
      assert.equal(existsSync(examplePath), false, `${plugin.id} has no private keys, so ${examplePath} must not exist`);
    } else {
      assert.equal(existsSync(examplePath), true, `${plugin.id} missing ${examplePath}`);
      assert.deepEqual(Object.keys(privateObj!).sort(), [...secretKeys].sort(), plugin.id);
    }
    const handbook = JSON.parse(
      await readFile(join(plugin.sourceDir!, 'docs', 'handbook.json'), 'utf8'),
    ) as {
      sections?: Array<{
        heading?: string;
        blocks?: Array<{ type?: string; language?: string; caption?: string; code?: string }>;
      }>;
    };
    const section = handbook.sections?.find((entry) => entry.heading === 'Config files');
    assert.ok(section, `${plugin.id} handbook Config files`);
    const publicBlock = section!.blocks?.find(
      (block) => block.type === 'code' && block.language === 'json' && block.caption === 'config.json',
    );
    const privateBlock = section!.blocks?.find(
      (block) =>
        block.type === 'code' &&
        block.language === 'json' &&
        block.caption === 'config.private.example.json',
    );
    assert.ok(publicBlock?.code, `${plugin.id} handbook public JSON`);
    assert.equal(
      JSON.stringify(canon(JSON.parse(publicBlock!.code!))),
      JSON.stringify(canon(publicObj)),
      plugin.id,
    );
    if (secretKeys.length === 0) {
      assert.equal(privateBlock, undefined, `${plugin.id} handbook must not show an empty private example`);
    } else {
      assert.ok(privateBlock?.code, `${plugin.id} handbook private example JSON`);
      assert.equal(
        JSON.stringify(canon(JSON.parse(privateBlock!.code!))),
        JSON.stringify(canon(privateObj)),
        plugin.id,
      );
    }
  }
});

test('kernel docs article documents tuucho-config JSON and plugin file permissions', async () => {
  const plugins = await loadManifests();
  const docs = plugins.find((plugin) => plugin.id === 'tuucho-docs-developer');
  const text = await readFile(join(docs!.sourceDir!, 'docs', 'articles.json'), 'utf8');
  const body = JSON.parse(text) as { articles: Array<{ id: string }> };
  const article = body.articles.find((entry) => entry.id === 'config-files');
  assert.ok(article);
  const blob = JSON.stringify(article);
  assert.ok(blob.includes('plugin_config_import'));
  assert.ok(blob.includes('plugin_config_export'));
  assert.ok(blob.includes('preferences'));
  assert.ok(blob.includes('tuucho-config/plugins/'));
  assert.ok(blob.includes('factory-backup'));
  assert.ok(blob.includes('config:migrate'));
  assert.ok(blob.includes('database.url'));
  assert.ok(blob.includes('jwt.secret'));
  assert.ok(blob.includes('plugins.json'));
  assert.ok(blob.includes('Update all'), 'config-files article must document Update all');
  assert.ok(blob.includes('plugin-config.zip'), 'config-files article must name plugin-config.zip');
  assert.ok(blob.includes('compat.core'), 'config-files article must document compat.core');
});
