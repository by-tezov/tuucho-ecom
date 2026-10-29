import type { Lang } from '../assets/i18n/types';
import { languageMeta } from '../assets/i18n/languages';
import { shopConfig } from './env';
import { runtimeDefaultLang } from './runtimeI18n';

// Build-time / pre-bootstrap default, duplicated as a constant rather than
// read through runtimeDefaultLang() because prerender (entry-server.tsx) runs
// before any bootstrap exists and needs a static value. Runtime paths use
// runtimeDefaultLang() instead — see orderedLanguages below. The cycle note:
// assets/i18n/index.ts re-exports LanguageContext, which needs this file
// (stripLangPrefix/localizedPath), so the runtime accessor lives in
// config/runtimeI18n.ts, importable from both sides without a cycle.
export const DEFAULT_LANG: Lang = 'en';

/** `og:locale` value per language — also the source for each language's
 * BCP-47 tag (schema.org `inLanguage`, `<html lang>`'s region-qualified
 * form): swap the underscore for a hyphen. Shared by Seo.tsx (runtime) and
 * entry-server.tsx (prerendered) so both describe a page identically. */
export const OG_LOCALES: Record<string, string> = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      return languageMeta(prop).ogLocale;
    },
    has(_target, prop) {
      return typeof prop === 'string';
    },
  },
) as Record<string, string>;

/**
 * Locale-prefixed URLs (`/fr/gallery`, `/en/gallery`) exist
 * for both the public/indexable route family (App.tsx's PUBLIC_ROUTE_DEFS)
 * and the signed-in/checkout customer journey (CUSTOMER_ROUTE_DEFS) — the
 * former for hreflang/canonical (an actual SEO gain), the latter purely so a
 * visitor's chosen language survives clicking from a localized page into
 * their cart or account instead of silently dropping back to French. Every
 * enabled language, including French, uses the `/{lang}` prefix. Only the
 * admin area has no prefixed counterpart: it's a single-operator internal
 * tool, never indexed, with no per-visitor language to preserve.
 */
export const ENABLED_LANGUAGES: Lang[] = shopConfig.enabledLanguages;

/** Default language first, then every other enabled language — hreflang and
 * prerender order. The default is resolved at call time: after bootstrap, the
 * configured `i18n.default` leads instead of the build-time DEFAULT_LANG. */
export function orderedLanguages(): Lang[] {
  const lead = runtimeDefaultLang();
  return [lead, ...ENABLED_LANGUAGES.filter((lang) => lang !== lead)];
}

/** Given a pathname, splits off a leading `/xx` segment if `xx` is an
 * enabled language — e.g. `/fr/gallery` -> `{ lang: 'fr', rest: '/gallery' }`,
 * `/fr/gallery` -> `{ lang: 'fr', rest: '/gallery' }`. A bare `/gallery` or a
 * private path like `/admin` (neither carries a real language segment)
 * returns `{ lang: null, rest: pathname }` unchanged. */
export function stripLangPrefix(pathname: string): { lang: Lang | null; rest: string } {
  const match = /^\/([a-z]{2,3})(\/.*|$)/.exec(pathname);
  const candidate = match?.[1];
  if (match && candidate && ENABLED_LANGUAGES.includes(candidate)) {
    return { lang: candidate, rest: match[2] || '/' };
  }
  return { lang: null, rest: pathname };
}

/** The URL for `rest` (an unprefixed path, e.g. `/gallery`) in `lang` —
 * every enabled language, including French, gets its `/xx` prefix. */
export function localizedPath(rest: string, lang: Lang): string {
  return `/${lang}${rest === '/' ? '' : rest}`;
}

/** If `pathWithSearch` is a bare localizable path, prefix it with `lang`.
 * Already-prefixed URLs, admin paths, and OAuth callbacks are left alone so
 * a deep link such as `/en/gallery?product=` is not rewritten. */
export function localizeIfBare(pathWithSearch: string, lang: Lang): string {
  const suffixIndex = pathWithSearch.search(/[?#]/);
  const pathname = suffixIndex === -1 ? pathWithSearch : pathWithSearch.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : pathWithSearch.slice(suffixIndex);
  const { lang: existing, rest } = stripLangPrefix(pathname);
  if (existing || !isLocalizablePath(rest)) return pathWithSearch;
  return `${localizedPath(rest, lang)}${suffix}`;
}

/** Mirrors App.tsx's PUBLIC_ROUTE_DEFS (plus the root `/`) and
 * CUSTOMER_ROUTE_DEFS — every path that has a locale-prefixed counterpart to
 * redirect/link to. Keep in sync with those two lists by hand; both are
 * small and change rarely. */
const LOCALIZABLE_PATH_PATTERNS: RegExp[] = [
  // Public / indexable
  /^\/$/,
  /^\/home$/,
  /^\/gallery$/,
  /^\/creations\/[^/]+$/,
  /^\/about$/,
  /^\/contact$/,
  /^\/capsules$/,
  /^\/pose$/,
  /^\/sizes$/,
  /^\/legal$/,
  /^\/privacy$/,
  /^\/terms$/,
  /^\/sales-terms$/,
  /^\/accessibility$/,
  /^\/sitemap$/,
  /^\/gift$/,
  // Signed-in / checkout customer journey (noindex, but still locale-aware)
  /^\/login$/,
  /^\/register$/,
  /^\/forgot-password$/,
  /^\/account\/reset-password$/,
  /^\/account\/confirm-email$/,
  /^\/account\/manage-order$/,
  /^\/account\/security-lock$/,
  /^\/account$/,
  /^\/account\/addresses$/,
  /^\/account\/addresses\/mondial-relay$/,
  /^\/account\/payment-methods$/,
  /^\/account\/loyalty$/,
  /^\/account\/notifications$/,
  /^\/cart$/,
  /^\/checkout\/return$/,
  /^\/orders$/,
  /^\/orders\/history$/,
  /^\/gift\/giver\/[^/]+$/,
  /^\/gift\/giver\/[^/]+\/cart$/,
  /^\/gift\/[^/]+$/,
  // Extra page plugins (hyphenated slugs such as /sales-terms). Single
  // tokens like /admin stay out so the operator area is never localized.
  /^\/[a-z0-9]+(?:-[a-z0-9]+)+$/,
];

/** Whether `rest` (an unprefixed path) has a locale-prefixed counterpart —
 * false only for the admin area, which never has one (see the doc comment
 * on ENABLED_LANGUAGES above). */
export function isLocalizablePath(rest: string): boolean {
  return LOCALIZABLE_PATH_PATTERNS.some((pattern) => pattern.test(rest));
}

/** Every language's URL for the page `pathname` addresses (default language
 * first) — the hreflang alternate set for that page, in both the
 * prerendered `<head>` (entry-server.tsx) and the client-side Seo
 * component. `pathname` may itself be prefixed or not; either way every
 * sibling is derived from its unprefixed `rest`. */
export function localizedSiblings(pathname: string): { lang: Lang; href: string }[] {
  const { rest } = stripLangPrefix(pathname);
  return orderedLanguages().map((lang) => ({
    lang,
    href: localizedPath(rest, lang),
  }));
}
