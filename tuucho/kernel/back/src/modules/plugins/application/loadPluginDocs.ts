import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginPackageDir } from './discoverPlugins.js';
import { listPlugins, type InstalledPlugin } from './pluginStore.js';

export type DocsTone = 'info' | 'warning' | 'important';

export type DocsBlock =
  | { type: 'p'; text: string }
  | { type: 'callout'; tone: DocsTone; title?: string; text: string }
  | { type: 'cards'; items: Array<{ title: string; text: string }> }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'defs'; items: Array<{ term: string; description: string }> }
  | { type: 'code'; language: string; code: string; caption?: string };

export type DocsSection = { heading: string; blocks: DocsBlock[] };

export type DocsArticle = {
  id: string;
  title: string;
  summary: string;
  group: string;
  groupTitle: string;
  pluginId: string;
  pluginEnabled: boolean;
  sections: DocsSection[];
};

export type DocsGroup = {
  id: string;
  title: string;
  pluginId?: string;
  enabled: boolean;
  articles: Array<{ id: string; title: string; summary: string }>;
};

type DiskArticle = {
  id?: unknown;
  title?: unknown;
  group?: unknown;
  groupTitle?: unknown;
  summary?: unknown;
  sections?: unknown;
};

type DiskHandbook = {
  title?: unknown;
  summary?: unknown;
  configure?: unknown;
  preferences?: unknown;
  cart?: unknown;
  orders?: unknown;
  profile?: unknown;
  notifications?: unknown;
  sections?: unknown;
};

const TONES = new Set<DocsTone>(['info', 'warning', 'important']);

const CORE_GROUP_RANK: Record<string, number> = {
  start: 0,
  kernel: 1,
  extend: 2,
  ship: 3,
  examples: 4,
};

const BUNDLED_GROUP_RANK: Record<string, number> = {
  'kind:page': 10,
  'kind:home': 11,
  'kind:commerce': 12,
  'kind:payment': 13,
  'kind:shipping': 14,
  'kind:seo': 15,
  'kind:journal': 16,
  'kind:theme': 17,
  'kind:user': 18,
  'kind:generic': 19,
  'kind:docs': 20,
};

const AREA_GROUP: Record<string, { id: string; title: string }> = {
  page: { id: 'kind:page', title: 'Pages' },
  home: { id: 'kind:home', title: 'Home' },
  commerce: { id: 'kind:commerce', title: 'Commerce' },
  payment: { id: 'kind:payment', title: 'Payments' },
  shipping: { id: 'kind:shipping', title: 'Shipping' },
  seo: { id: 'kind:seo', title: 'SEO' },
  journal: { id: 'kind:journal', title: 'Journals' },
  theme: { id: 'kind:theme', title: 'Theme' },
  docs: { id: 'kind:docs', title: 'This guide' },
};

const KIND_GROUP: Record<string, { id: string; title: string }> = {
  page: AREA_GROUP.page!,
  commerce: AREA_GROUP.commerce!,
  seo: AREA_GROUP.seo!,
  shipping: AREA_GROUP.shipping!,
  payment: AREA_GROUP.payment!,
  theme: AREA_GROUP.theme!,
  docs: AREA_GROUP.docs!,
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function isBlankHandbookField(value: string | undefined): boolean {
  if (!value) return true;
  const normalised = value.trim().toLowerCase().replace(/\.+$/, '');
  return normalised === '' || normalised === 'none' || normalised === 'n/a' || normalised === 'no';
}

export function docsGroupForPlugin(plugin: {
  id: string;
  manifest: { kinds: string[]; installPath?: string; sourceDir?: string };
}): { id: string; title: string } {
  const path = (plugin.manifest.installPath ?? plugin.manifest.sourceDir ?? plugin.id).replaceAll('\\', '/');
  const parts = path.split('/').filter(Boolean);
  const pluginsAt = parts.indexOf('plugins');
  if (pluginsAt >= 0) {
    const area = parts[pluginsAt + 1];
    if (area === 'user') return { id: 'kind:user', title: 'User plugins' };
    if (area && AREA_GROUP[area]) return AREA_GROUP[area];
  }
  const srcAt = parts.indexOf('src');
  if (srcAt >= 0 && parts[srcAt + 1] === 'plugins') return { id: 'kind:user', title: 'User plugins' };
  const primary = plugin.manifest.kinds[0] ?? 'generic';
  return KIND_GROUP[primary] ?? { id: 'kind:generic', title: 'Other plugins' };
}

function parsePairList(value: unknown, left: string, right: string): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  const items: Array<Record<string, string>> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const body = entry as Record<string, unknown>;
    const a = asString(body[left]);
    const b = asString(body[right]);
    if (!a || !b) continue;
    items.push({ [left]: a, [right]: b });
  }
  return items;
}

export function parseDocsBlock(raw: unknown): DocsBlock | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const type = asString(body.type);
  if (type === 'p') {
    const text = asString(body.text);
    return text ? { type: 'p', text } : null;
  }
  if (type === 'callout') {
    const text = asString(body.text);
    const tone = asString(body.tone);
    if (!text || !tone || !TONES.has(tone as DocsTone)) return null;
    const title = asString(body.title);
    return title
      ? { type: 'callout', tone: tone as DocsTone, title, text }
      : { type: 'callout', tone: tone as DocsTone, text };
  }
  if (type === 'cards') {
    const items = parsePairList(body.items, 'title', 'text') as Array<{ title: string; text: string }>;
    return items.length ? { type: 'cards', items } : null;
  }
  if (type === 'steps') {
    const items = asStringList(body.items);
    return items.length ? { type: 'steps', items } : null;
  }
  if (type === 'list') {
    const items = asStringList(body.items);
    if (!items.length) return null;
    return body.ordered === true ? { type: 'list', ordered: true, items } : { type: 'list', items };
  }
  if (type === 'table') {
    const columns = asStringList(body.columns);
    const rows = Array.isArray(body.rows)
      ? body.rows
          .map((row) => asStringList(row))
          .filter((row) => row.length > 0)
      : [];
    return columns.length && rows.length ? { type: 'table', columns, rows } : null;
  }
  if (type === 'defs') {
    const items = parsePairList(body.items, 'term', 'description') as Array<{
      term: string;
      description: string;
    }>;
    return items.length ? { type: 'defs', items } : null;
  }
  if (type === 'code') {
    const code = asString(body.code);
    if (!code) return null;
    const language = asString(body.language) ?? 'ts';
    const caption = asString(body.caption);
    return caption ? { type: 'code', language, code, caption } : { type: 'code', language, code };
  }
  return null;
}

export function parseDocsSection(raw: unknown): DocsSection | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const heading = asString(body.heading);
  if (!heading) return null;
  const fromBlocks = Array.isArray(body.blocks)
    ? body.blocks.map(parseDocsBlock).filter((block): block is DocsBlock => Boolean(block))
    : [];
  if (fromBlocks.length) return { heading, blocks: fromBlocks };
  const paragraphs = asStringList(body.paragraphs);
  const code = asString(body.code);
  const blocks: DocsBlock[] = paragraphs.map((text) => ({ type: 'p', text }));
  if (code) blocks.push({ type: 'code', language: asString(body.language) ?? 'ts', code });
  return { heading, blocks };
}

function parseSections(raw: unknown): DocsSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseDocsSection).filter((section): section is DocsSection => Boolean(section));
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

export function handbookHasDeveloperContent(handbook: { sections?: unknown } | null): boolean {
  return parseSections(handbook?.sections).length > 0;
}

export function handbookArticle(plugin: InstalledPlugin, handbook: DiskHandbook | null): DocsArticle | null {
  const sections = parseSections(handbook?.sections);
  if (!sections.length) return null;
  const manifest = plugin.manifest;
  const group = docsGroupForPlugin(plugin);
  const title = asString(handbook?.title) ?? manifest.name;
  const summary = asString(handbook?.summary) ?? manifest.description;
  return {
    id: `plugin-${manifest.id}`,
    title,
    summary,
    group: group.id,
    groupTitle: group.title,
    pluginId: manifest.id,
    pluginEnabled: plugin.enabled,
    sections,
  };
}

export function diskArticles(plugin: InstalledPlugin, raw: unknown): DocsArticle[] {
  if (!raw || typeof raw !== 'object') return [];
  const body = raw as { articles?: unknown };
  if (!Array.isArray(body.articles)) return [];
  const articles: DocsArticle[] = [];
  for (const entry of body.articles as DiskArticle[]) {
    const id = asString(entry.id);
    const title = asString(entry.title);
    if (!id || !title) continue;
    const group = asString(entry.group) ?? `plugin:${plugin.id}`;
    articles.push({
      id,
      title,
      summary: asString(entry.summary) ?? '',
      group,
      groupTitle: asString(entry.groupTitle) ?? title,
      pluginId: plugin.id,
      pluginEnabled: plugin.enabled,
      sections: parseSections(entry.sections),
    });
  }
  return articles;
}

export function assembleDocsSite(articles: DocsArticle[]): { groups: DocsGroup[]; articles: DocsArticle[] } {
  const groupTitles = new Map<string, { title: string; pluginId?: string; enabled: boolean }>();
  for (const article of articles) {
    const current = groupTitles.get(article.group);
    if (!current) {
      groupTitles.set(article.group, {
        title: article.groupTitle,
        pluginId: article.group.startsWith('plugin:') ? article.pluginId : undefined,
        enabled: article.pluginEnabled,
      });
      continue;
    }
    current.enabled = current.enabled && article.pluginEnabled;
  }

  const groupRank = (id: string) => CORE_GROUP_RANK[id] ?? BUNDLED_GROUP_RANK[id] ?? 50;
  const groups: DocsGroup[] = [...groupTitles.entries()]
    .sort((a, b) => {
      const rank = groupRank(a[0]) - groupRank(b[0]);
      if (rank !== 0) return rank;
      return a[1].title.localeCompare(b[1].title);
    })
    .map(([id, meta]) => ({
      id,
      title: meta.title,
      pluginId: meta.pluginId,
      enabled: meta.enabled,
      articles: articles
        .filter((article) => article.group === id)
        .map((article) => ({ id: article.id, title: article.title, summary: article.summary })),
    }));

  const ordered = groups.flatMap((group) => articles.filter((article) => article.group === group.id));
  return { groups, articles: ordered };
}

export async function buildDocsSite(): Promise<{ groups: DocsGroup[]; articles: DocsArticle[] }> {
  const plugins = await listPlugins();
  const articles: DocsArticle[] = [];
  for (const plugin of plugins) {
    if (plugin.manifest.kinds.length === 1 && plugin.manifest.kinds[0] === 'locale') continue;
    const folder = plugin.missingFromDisk ? undefined : plugin.manifest.sourceDir;
    if (!folder) continue;
    const dir = join(pluginPackageDir(plugin.manifest), 'docs');
    const fromArticles = diskArticles(plugin, await readJson(join(dir, 'articles.json')));
    const handbook = (await readJson(join(dir, 'handbook.json'))) as DiskHandbook | null;
    articles.push(...fromArticles);
    const skipHandbook =
      plugin.id === 'tuucho-docs-developer' ||
      fromArticles.some((article) => article.id === `plugin-${plugin.id}`);
    if (skipHandbook) continue;
    const article = handbookArticle(plugin, handbook);
    if (article) articles.push(article);
  }
  return assembleDocsSite(articles);
}
