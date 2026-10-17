import { PRIVATE_SEO_ROBOTS_TXT } from '../../../config/publicSeo.js';
import type { RedirectRule, RobotsRule, SitemapEntry } from './types.js';

/** Public kernel pages that are not page-plugin routes. Extra plugin URLs
 * (page `route`, /pose, /capsules, …) arrive through seo.sitemap.entries. */
export const KERNEL_SITEMAP_PATHS = [
  '/',
  '/gallery',
  '/privacy',
  '/terms',
  '/sales-terms',
  '/sitemap',
] as const;

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function absoluteShopUrl(origin: string, path: string): string {
  const prefix = origin.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${prefix}${suffix}`;
}

export function dedupeSitemapEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const entry of entries) {
    const loc = entry.loc?.trim();
    if (!loc || seen.has(loc)) continue;
    seen.add(loc);
    out.push({ ...entry, loc });
  }
  return out;
}

export function renderSitemapXml(entries: SitemapEntry[]): string {
  const urls = dedupeSitemapEntries(entries).map((entry) => {
    const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '';
    return `<url><loc>${escapeXml(entry.loc)}</loc>${lastmod}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}

export function assembleRobotsText(
  rules: RobotsRule[],
  sitemapUrl: string,
  publicIndexing = true,
): string {
  if (!publicIndexing) return PRIVATE_SEO_ROBOTS_TXT;
  const groups = new Map<string, string[]>();
  const push = (userAgent: string, line: string) => {
    const rows = groups.get(userAgent) ?? [];
    if (!rows.includes(line)) rows.push(line);
    groups.set(userAgent, rows);
  };
  push('*', 'Allow: /');
  for (const rule of rules) {
    const agent = (rule.userAgent || '*').trim() || '*';
    if (rule.directive === 'Sitemap') continue;
    const value = rule.value.trim();
    if (!value) continue;
    push(agent, `${rule.directive}: ${value}`);
  }
  const blocks: string[] = [];
  for (const [agent, lines] of groups) {
    blocks.push(`User-agent: ${agent}`, ...lines, '');
  }
  blocks.push(`Sitemap: ${sitemapUrl}`, '');
  return blocks.join('\n');
}

export function findRedirect(
  path: string,
  stored: RedirectRule[],
  extra: RedirectRule[],
): RedirectRule | null {
  const hit = [...stored, ...extra].find((row) => row.fromPath === path);
  return hit ?? null;
}

export function normalizeRedirectInput(
  fromPath: unknown,
  toPath: unknown,
  status: unknown,
): { fromPath: string; toPath: string; status: 301 | 410 } | { error: 'invalid_request' } {
  const from = String(fromPath ?? '');
  const to = String(toPath ?? '');
  const code = Number(status ?? 301) === 410 ? 410 : 301;
  if (!from.startsWith('/') || (code !== 410 && !to.startsWith('/'))) {
    return { error: 'invalid_request' };
  }
  if (code === 410 && to !== '' && !to.startsWith('/')) {
    return { error: 'invalid_request' };
  }
  return { fromPath: from, toPath: code === 410 ? to || '/' : to, status: code };
}
