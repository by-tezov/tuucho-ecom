import { localizedPath, stripLangPrefix } from '../config/i18nRoutes';
import { GALLERY_PATH, HOME_PATH } from '../config/paths';

/**
 * Web search hosts. `www.google.fr` counts; Gmail and Accounts do not, so a
 * mail link to Accueil stays on Accueil. The Android Google app reports an
 * `android-app:` referrer whose host is the package name.
 */
const SEARCH_HOST =
  /^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$|^(?:.+\.)?(?:bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|qwant\.com|startpage\.com|search\.brave\.com|kagi\.com|lilo\.org|baidu\.com|mojeek\.com)$|^(?:.+\.)?yandex\.[a-z]{2,3}$/;

const GOOGLE_APP_HOST = 'com.google.android.googlequicksearchbox';

export function isSearchEngineReferrer(referrer: string): boolean {
  if (!referrer) return false;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host === GOOGLE_APP_HOST || SEARCH_HOST.test(host);
  } catch {
    return false;
  }
}

/**
 * Phone-sized cold load of Accueil from a search results page opens the
 * gallery instead. Desktop, a bookmark, a typed `/home`, and a later in-app
 * Accueil tap stay put: this only looks at the document referrer of the
 * load that opened the tab. Crawlers fetch `/home` with no search referrer,
 * so the indexed page is unchanged. After a gift confirm, Accueil is the
 * mobile destination and is left alone.
 *
 * Returns the gallery path (language prefix kept) or null to resume the
 * original URL.
 */
export function galleryPathForSearchEngineHome(input: {
  pathname: string;
  referrer: string;
  mobile: boolean;
  followLocked: boolean;
}): string | null {
  if (!input.mobile || input.followLocked || !isSearchEngineReferrer(input.referrer)) return null;
  const { lang, rest } = stripLangPrefix(input.pathname);
  if (rest !== HOME_PATH) return null;
  return lang ? localizedPath(GALLERY_PATH, lang) : GALLERY_PATH;
}
