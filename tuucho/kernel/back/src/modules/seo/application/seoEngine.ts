import { randomUUID } from 'node:crypto';
import { applyFilters } from '../../plugins/application/hooks.js';
import { isPluginEffectivelyEnabled, listPlugins } from '../../plugins/application/pluginStore.js';
import { pluginSurfaceEnabled } from '../../plugins/application/pluginSurface.js';
import { listPublicProductUidsForSitemap } from '../../catalog/application/productSitemap.js';
import { setPagePath } from '../../catalog/application/seoDocument.js';
import { outOfStockProductsEnabled } from '../../catalog/application/outOfStockVisibility.js';
import { pool } from '../../../db/pool.js';
import { config } from '../../../config/env.js';
import { isPublicSeoTarget } from '../../../config/publicSeo.js';
import {
  absoluteShopUrl,
  assembleRobotsText,
  dedupeSitemapEntries,
  findRedirect,
  KERNEL_SITEMAP_PATHS,
  renderSitemapXml,
} from './assembleSeo.js';
import type { RedirectRule, RobotsRule, SeoPluginFlags, SitemapEntry, StoredRedirect } from './types.js';

export { KERNEL_SITEMAP_PATHS } from './assembleSeo.js';

export const SEO_SITEMAP_PLUGIN = 'tuucho-seo-sitemap';
export const SEO_ROBOTS_PLUGIN = 'tuucho-seo-robots';
export const SEO_REDIRECTS_PLUGIN = 'tuucho-seo-redirects';

export async function seoPluginFlags(): Promise<SeoPluginFlags> {
  const [sitemap, robots, redirects] = await Promise.all([
    isPluginEffectivelyEnabled(SEO_SITEMAP_PLUGIN),
    isPluginEffectivelyEnabled(SEO_ROBOTS_PLUGIN),
    isPluginEffectivelyEnabled(SEO_REDIRECTS_PLUGIN),
  ]);
  return { sitemap, robots, redirects };
}

function shopSitemapUrl(): string {
  return absoluteShopUrl(config.frontendBaseUrl, '/sitemap.xml');
}

const KERNEL_ROBOTS_DISALLOW = ['/admin', '/account', '/checkout', '/gallery?'];

async function pagePluginSitemapEntries(): Promise<SitemapEntry[]> {
  const plugins = await listPlugins();
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  return plugins.flatMap((plugin) => {
    if (plugin.manifest.kind !== 'page' || !plugin.manifest.route) return [];
    if (!pluginSurfaceEnabled(plugin, byId)) return [];
    const path = plugin.manifest.route.startsWith('/') ? plugin.manifest.route : `/${plugin.manifest.route}`;
    return [{ loc: absoluteShopUrl(config.frontendBaseUrl, path), source: plugin.id }];
  });
}

async function kernelSitemapEntries(): Promise<SitemapEntry[]> {
  const pages = KERNEL_SITEMAP_PATHS.map((path) => ({
    loc: absoluteShopUrl(config.frontendBaseUrl, path),
    source: 'kernel:page',
  }));
  const inStockOnly = !(await outOfStockProductsEnabled());
  const products = (
    await Promise.all(
      (['nail', 'nail_single', 'accessory'] as const).map((productType) =>
        listPublicProductUidsForSitemap(pool, inStockOnly, productType),
      ),
    )
  ).flat();
  const productEntries = products.map((row) => ({
    loc: absoluteShopUrl(config.frontendBaseUrl, setPagePath(row.productUid)),
    lastmod: row.lastmod,
    source: 'kernel:product',
  }));
  return [...pages, ...(await pagePluginSitemapEntries()), ...productEntries];
}

export async function collectSitemapEntries(): Promise<SitemapEntry[]> {
  const extra = await applyFilters<SitemapEntry[]>('seo.sitemap.entries', []);
  return dedupeSitemapEntries([...await kernelSitemapEntries(), ...extra]);
}

export function publicSeoEnabled(): boolean {
  return isPublicSeoTarget(config.target);
}

export async function sitemapXml(): Promise<string | null> {
  if (!publicSeoEnabled()) return null;
  return renderSitemapXml(await collectSitemapEntries());
}

export async function shopRobotsText(): Promise<string> {
  if (!publicSeoEnabled()) return assembleRobotsText([], shopSitemapUrl(), false);
  const kernelRules: RobotsRule[] = KERNEL_ROBOTS_DISALLOW.map((value) => ({
    directive: 'Disallow',
    value,
  }));
  const extra = await applyFilters<RobotsRule[]>('seo.robots.rules', kernelRules);
  return assembleRobotsText(extra, shopSitemapUrl(), true);
}

export async function listStoredRedirects(): Promise<StoredRedirect[]> {
  const { rows } = await pool.query<{ id: string; from_path: string; to_path: string; status: number }>(
    `select id, from_path, to_path, status from seo_redirects order by from_path`,
  );
  return rows.map((row) => ({
    id: row.id,
    fromPath: row.from_path,
    toPath: row.to_path,
    status: row.status,
  }));
}

export async function upsertStoredRedirect(fromPath: string, toPath: string, status: 301 | 410): Promise<void> {
  await pool.query(
    `insert into seo_redirects (id, from_path, to_path, status) values ($1, $2, $3, $4)
     on conflict (from_path) do update set to_path = excluded.to_path, status = excluded.status`,
    [randomUUID(), fromPath, toPath, status],
  );
}

export async function deleteStoredRedirect(id: string): Promise<boolean> {
  const result = await pool.query(`delete from seo_redirects where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function lookupAppliedRedirect(path: string): Promise<RedirectRule | null> {
  if (!(await isPluginEffectivelyEnabled(SEO_REDIRECTS_PLUGIN))) return null;
  const stored = (await listStoredRedirects()).map((row) => ({
    fromPath: row.fromPath,
    toPath: row.toPath,
    status: row.status === 410 ? (410 as const) : (301 as const),
    source: 'kernel:table',
  }));
  const extra = await applyFilters<RedirectRule[]>('seo.redirects.rules', []);
  return findRedirect(path, stored, extra);
}

export async function buildSeoHub(): Promise<{
  environment: { target: string; publicIndexing: boolean };
  plugins: SeoPluginFlags;
  sitemap: { xmlPath: string; urls: SitemapEntry[]; published: boolean };
  robots: { text: string; inspectPath: string };
  redirects: { applied: boolean; rows: StoredRedirect[] };
}> {
  const plugins = await seoPluginFlags();
  const publicIndexing = publicSeoEnabled();
  const [urls, text, rows] = await Promise.all([
    collectSitemapEntries(),
    shopRobotsText(),
    listStoredRedirects(),
  ]);
  return {
    environment: { target: config.target, publicIndexing },
    plugins,
    sitemap: { xmlPath: '/sitemap.xml', urls, published: publicIndexing },
    robots: { text, inspectPath: '/storefront/robots.txt' },
    redirects: { applied: plugins.redirects, rows },
  };
}
