import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleDocsSite,
  docsGroupForPlugin,
  handbookArticle,
  handbookHasDeveloperContent,
  isBlankHandbookField,
  parseDocsBlock,
  parseDocsSection,
  type DocsArticle,
} from '../../../../../src/modules/plugins/application/loadPluginDocs.js';

test('blank handbook fields skip None placeholders', () => {
  assert.equal(isBlankHandbookField('None.'), true);
  assert.equal(isBlankHandbookField('n/a'), true);
  assert.equal(isBlankHandbookField('Open Admin, Loyalty in the sidebar.'), false);
});

test('docs groups follow install path, not generic kind', () => {
  assert.deepEqual(
    docsGroupForPlugin({
      id: 'tuucho-journal-api',
      manifest: { kind: 'generic', installPath: 'tuucho/plugins/journal/api/tuucho-journal-api' },
    }),
    { id: 'kind:journal', title: 'Journals' },
  );
  assert.deepEqual(
    docsGroupForPlugin({
      id: 'tuucho-shipping-expedition-cron',
      manifest: { kind: 'generic', installPath: 'tuucho/plugins/shipping/expedition-cron/tuucho-shipping-expedition-cron' },
    }),
    { id: 'kind:shipping', title: 'Shipping' },
  );
  assert.deepEqual(
    docsGroupForPlugin({
      id: 'page-guides',
      manifest: { kind: 'page', installPath: 'src/plugins/demo/guides/page-guides' },
    }),
    { id: 'kind:user', title: 'User plugins' },
  );
});

test('parseDocsBlock keeps callout, table, and highlighted code', () => {
  assert.deepEqual(
    parseDocsBlock({ type: 'callout', tone: 'important', title: 'Production only', text: 'APP_TARGET must be prod.' }),
    { type: 'callout', tone: 'important', title: 'Production only', text: 'APP_TARGET must be prod.' },
  );
  const table = parseDocsBlock({
    type: 'table',
    columns: ['Owner', 'Responsibility'],
    rows: [['Kernel', 'Settings → SEO']],
  });
  assert.equal(table?.type, 'table');
  const code = parseDocsBlock({ type: 'code', language: 'ts', code: 'const x = 1;' });
  assert.deepEqual(code, { type: 'code', language: 'ts', code: 'const x = 1;' });
  assert.equal(parseDocsBlock({ type: 'callout', tone: 'loud', text: 'nope' }), null);
});

test('legacy paragraphs become blocks', () => {
  const section = parseDocsSection({
    heading: 'Legacy',
    paragraphs: ['A sentence.'],
    code: 'const ok = true;',
  });
  assert.equal(section?.heading, 'Legacy');
  assert.equal(section?.blocks[0]?.type, 'p');
  assert.equal(section?.blocks[1]?.type, 'code');
});

test('handbookArticle skips identity filler and empty files', () => {
  const plugin = {
    id: 'home-faq',
    enabled: true,
    missingFromDisk: false,
    manifest: {
      id: 'home-faq',
      name: 'Home FAQ',
      version: '1.0.0',
      kind: 'generic',
      description: 'FAQ block',
      installPath: 'src/plugins/home/faq/home-faq',
    },
  };
  assert.equal(handbookHasDeveloperContent(null), false);
  assert.equal(handbookArticle(plugin as never, null), null);
  assert.equal(
    handbookArticle(plugin as never, { title: 'Home FAQ', summary: 'x', configure: 'No Configure form.' }),
    null,
  );
  const article = handbookArticle(plugin as never, {
    title: 'Home FAQ',
    summary: 'How entries get in',
    sections: [
      {
        heading: 'Entries',
        blocks: [{ type: 'p', text: 't.faq.items is { q, a }[].' }],
      },
    ],
  });
  assert.ok(article);
  assert.equal(article.sections.length, 1);
  const blob = JSON.stringify(article.sections);
  assert.equal(blob.includes('"Package"'), false);
  assert.equal(blob.includes('"Kind"'), false);
  assert.equal(blob.includes('No Configure form'), false);
});

test('assembleDocsSite orders core groups then SEO area', () => {
  const articles: DocsArticle[] = [
    {
      id: 'plugin-seo',
      title: 'Sitemap pages',
      summary: '',
      group: 'kind:seo',
      groupTitle: 'SEO',
      pluginId: 'tuucho-seo-sitemap',
      pluginEnabled: true,
      sections: [],
    },
    {
      id: 'welcome',
      title: 'Welcome',
      summary: '',
      group: 'start',
      groupTitle: 'Start here',
      pluginId: 'tuucho-docs-developer',
      pluginEnabled: true,
      sections: [],
    },
    {
      id: 'extend-seo',
      title: 'Extend SEO',
      summary: '',
      group: 'extend',
      groupTitle: 'Extend the shop',
      pluginId: 'tuucho-docs-developer',
      pluginEnabled: true,
      sections: [],
    },
  ];
  const site = assembleDocsSite(articles);
  assert.deepEqual(
    site.groups.map((group) => group.id),
    ['start', 'extend', 'kind:seo'],
  );
  assert.deepEqual(
    site.articles.map((article) => article.id),
    ['welcome', 'extend-seo', 'plugin-seo'],
  );
});
