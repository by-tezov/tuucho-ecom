import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dependencyId, dependencyRange } from '../domain/pluginDependency.js';
import { pluginsDirectory } from './discoverPlugins.js';
import { listPlugins, type InstalledPlugin } from './pluginStore.js';

export type DocsSection = { heading: string; paragraphs: string[]; code?: string };

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
  summary?: unknown;
  group?: unknown;
  groupTitle?: unknown;
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
  openingsUsed?: unknown;
  openingsProvided?: unknown;
  sections?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseSections(raw: unknown): DocsSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: DocsSection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const body = entry as Record<string, unknown>;
    const heading = asString(body.heading);
    if (!heading) continue;
    const paragraphs = asStringList(body.paragraphs);
    const code = asString(body.code);
    sections.push(code ? { heading, paragraphs, code } : { heading, paragraphs });
  }
  return sections;
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function handbookArticle(plugin: InstalledPlugin, handbook: DiskHandbook | null): DocsArticle {
  const manifest = plugin.manifest;
  const title = asString(handbook?.title) ?? manifest.name;
  const summary = asString(handbook?.summary) ?? manifest.description;
  const deps =
    (manifest.dependsOn ?? [])
      .map((dep) => {
        const range = dependencyRange(dep);
        return range ? `${dependencyId(dep)} ${range}` : dependencyId(dep);
      })
      .join(', ') || 'none';
  const permissions = (manifest.permissions ?? []).map((row) => row.code).join(', ') || 'none';
  const sections: DocsSection[] = [
    {
      heading: 'Identity',
      paragraphs: [
        `id: ${manifest.id}. kind: ${manifest.kind}. version: ${manifest.version}. engines.core: ${manifest.engines?.core ?? 'any'}.`,
        `dependsOn: ${deps}. permissions: ${permissions}. provides: ${(manifest.provides ?? []).join(', ') || 'none'}.`,
        plugin.enabled ? 'This plugin is currently enabled.' : 'This plugin is currently disabled. Its admin and storefront surfaces are hidden.',
      ],
    },
  ];
  const configure = asString(handbook?.configure);
  const preferences = asString(handbook?.preferences);
  if (configure || preferences) {
    sections.push({
      heading: 'Configure and Preferences',
      paragraphs: [configure, preferences].filter((item): item is string => Boolean(item)),
    });
  }
  const used = asStringList(handbook?.openingsUsed);
  const provided = asStringList(handbook?.openingsProvided);
  if (used.length > 0 || provided.length > 0) {
    sections.push({
      heading: 'Openings',
      paragraphs: [
        provided.length > 0 ? `Provides: ${provided.join(', ')}.` : '',
        used.length > 0 ? `Uses: ${used.join(', ')}.` : '',
      ].filter(Boolean),
    });
  }
  const cart = asString(handbook?.cart);
  const orders = asString(handbook?.orders);
  const profile = asString(handbook?.profile);
  const notifications = asString(handbook?.notifications);
  if (cart || orders || profile || notifications) {
    sections.push({
      heading: 'Cart, orders, profile',
      paragraphs: [cart, orders, profile, notifications].filter((item): item is string => Boolean(item)),
    });
  }
  sections.push(...parseSections(handbook?.sections));
  return {
    id: `plugin-${manifest.id}`,
    title,
    summary,
    group: `plugin:${manifest.id}`,
    groupTitle: title,
    pluginId: manifest.id,
    pluginEnabled: plugin.enabled,
    sections,
  };
}

function diskArticles(plugin: InstalledPlugin, raw: unknown): DocsArticle[] {
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

export async function buildDocsSite(): Promise<{ groups: DocsGroup[]; articles: DocsArticle[] }> {
  const plugins = await listPlugins();
  const root = pluginsDirectory();
  let folders: string[] = [];
  try {
    folders = await readdir(root);
  } catch {
    folders = [];
  }
  const folderSet = new Set(folders);
  const articles: DocsArticle[] = [];
  for (const plugin of plugins) {
    if (!folderSet.has(plugin.id)) {
      articles.push(handbookArticle(plugin, null));
      continue;
    }
    const dir = join(root, plugin.id, 'docs');
    const fromArticles = diskArticles(plugin, await readJson(join(dir, 'articles.json')));
    const handbook = (await readJson(join(dir, 'handbook.json'))) as DiskHandbook | null;
    articles.push(...fromArticles);
    const hasPluginPage = fromArticles.some((article) => article.id === `plugin-${plugin.id}`);
    if (!hasPluginPage) articles.push(handbookArticle(plugin, handbook));
  }

  const groupOrder = (id: string) => {
    if (id === 'core') return 0;
    if (id === 'examples') return 1;
    return 2;
  };
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
  const groups: DocsGroup[] = [...groupTitles.entries()]
    .sort((a, b) => {
      const rank = groupOrder(a[0]) - groupOrder(b[0]);
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

  return { groups, articles };
}
