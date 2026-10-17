/** Functional browsers are `locale: 'fr-FR'` with empty `psn-lang`, so a
 * bare shop URL negotiates to French. Specs should open the prefixed URL
 * directly instead of racing splash → bare path → `/fr/…`. */
export const TEST_SHOP_LANG = 'fr' as const;

/** Prefixed shop path for the functional-test language (`/gallery` →
 * `/fr/gallery`, `/` → `/fr`). OAuth/admin paths are not passed here. */
export function shopPath(rest: string): string {
  if (rest === '/') return `/${TEST_SHOP_LANG}`;
  const normalized = rest.startsWith('/') ? rest : `/${rest}`;
  return `/${TEST_SHOP_LANG}${normalized}`;
}

/** `shopPath` plus an existing `?query` / `#hash` suffix. */
export function shopPathWithSearch(pathWithSearch: string): string {
  const suffixIndex = pathWithSearch.search(/[?#]/);
  if (suffixIndex === -1) return shopPath(pathWithSearch);
  return `${shopPath(pathWithSearch.slice(0, suffixIndex))}${pathWithSearch.slice(suffixIndex)}`;
}

export function isShopPath(pathname: string, rest: string): boolean {
  const actual = pathname.replace(/\/$/, '') || '/';
  const expected = shopPath(rest).replace(/\/$/, '') || '/';
  return actual === expected;
}

const SHOP_NAV_ROOTS = [
  '/home',
  '/gallery',
  '/creations',
  '/about',
  '/contact',
  '/pose',
  '/sizes',
  '/legal',
  '/privacy',
  '/terms',
  '/sales-terms',
  '/sitemap',
  '/gift',
  '/login',
  '/register',
  '/forgot-password',
  '/account',
  '/cart',
  '/checkout',
  '/orders',
] as const;

/** Prefix a shop URL for Patchright navigation. Leaves splash `/`, OAuth
 * callbacks, admin, and unknown paths (404 fixtures) unchanged. */
export function shopNavigatePath(pathWithSearch: string): string {
  const suffixIndex = pathWithSearch.search(/[?#]/);
  const pathname = suffixIndex === -1 ? pathWithSearch : pathWithSearch.slice(0, suffixIndex);
  if (pathname === '/' || pathname.startsWith('/auth/') || pathname.startsWith('/admin')) {
    return pathWithSearch;
  }
  const matches = SHOP_NAV_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
  if (!matches) return pathWithSearch;
  return shopPathWithSearch(pathWithSearch);
}
