import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Lang, Strings } from '../assets/i18n/types';
import {
  defaultLang,
  getCachedDictionary,
  isRuntimeDictionary,
  loadDictionary,
  setCachedDictionary,
} from '../assets/i18n/dictionaryCache';
import { en } from '../assets/i18n/strings.en';
import { preferredLanguage, savePreferredLanguage } from '../assets/i18n/languagePreference';
import { isLocalizablePath, localizedPath, stripLangPrefix } from '../config/i18nRoutes';
import { usePrerenderedLanguage } from './PrerenderPayload';
import {
  assembleDictionary,
  frenchAvailable,
  localeCatalogRevision,
  localeEnablementFromKey,
  localeEnablementKey,
  subscribeLocaleCatalogs,
} from '../plugins/localeCatalog';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';

const LANGUAGES_EN: Lang[] = ['en'];
const LANGUAGES_EN_FR: Lang[] = ['en', 'fr'];

interface LanguageContextValue {
  lang: Lang;
  t: Strings;
  setLang: (lang: Lang) => void;
  availableLanguages: Lang[];
  /** False only while a non-default preferred language dictionary is still
   * loading on cold boot — SplashEntry waits for this before leaving the
   * intro so the first visible paint is not English→other. */
  langReady: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function initialLangReady(): boolean {
  if (typeof window === 'undefined') return true;
  return preferredLanguage() === defaultLang;
}

// A language disabled since the preference was stored (VITE_ENABLED_LANGUAGES
// changed) must not be restored — fall back to the default instead.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  // A locale-prefixed URL (/fr/gallery) is authoritative: it's what
  // scripts/prerender.mjs built this exact HTML with (see PrerenderPayload),
  // so it drives `lang` directly instead of the localStorage-restore dance
  // below — that dance is what kept every language but French invisible to
  // crawlers, since it only ever ran after mount, client-side.
  const { lang: urlLang, rest } = stripLangPrefix(location.pathname);
  const prerendered = usePrerenderedLanguage(location.pathname);

  const bootstrap = useStorefrontBootstrap();
  const enablementKey = localeEnablementKey(bootstrap.plugins);
  const localeEnabled = useMemo(() => localeEnablementFromKey(enablementKey), [enablementKey]);
  const catalogsRev = useSyncExternalStore(subscribeLocaleCatalogs, localeCatalogRevision, localeCatalogRevision);
  const frOn = frenchAvailable(localeEnabled);
  const availableLanguages = frOn ? LANGUAGES_EN_FR : LANGUAGES_EN;

  const [lang, setLangState] = useState<Lang>(urlLang ?? defaultLang);
  const [dict, setDict] = useState<Strings>(
    () => prerendered?.dict ?? (urlLang && getCachedDictionary(urlLang)) ?? en,
  );
  const [langReady, setLangReady] = useState<boolean>(() => urlLang != null || initialLangReady());
  // Dynamic locale chunks cannot be aborted, so their completion is versioned
  // instead. This covers a fast sequence of selections on private/admin
  // routes, where changing language does not navigate.
  const languageLoadGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      languageLoadGenerationRef.current += 1;
    };
  }, []);

  // Keeps `lang`/`dict` in lockstep with a locale-prefixed URL once it has
  // actually settled (covers a client-side-only first visit to /fr/… whose
  // chunk isn't cached yet). Bare localizable URLs are not a language of
  // their own: the redirect effect below sends them to /xx/…. This must
  // live in an effect rather than run eagerly inside setLang: `navigate()`
  // does not update `location` in the same render it's called in, and an
  // eager update inside setLang raced this same correction reading the
  // *old* urlLang mid-transition, undoing the very change setLang had just
  // made.
  //
  // Locale-prefixed prerender embeds `dict` via JSON, which strips function
  // formatters. Initial state still paints that payload (hydration parity /
  // no French flash), then this effect always upgrades to the real module
  // even when `lang` already matches `urlLang`.
  useEffect(() => {
    if (!urlLang) return;
    if (lang === urlLang && isRuntimeDictionary(dict)) return;
    const loadGeneration = ++languageLoadGenerationRef.current;
    const cached = getCachedDictionary(urlLang);
    if (cached && isRuntimeDictionary(cached)) {
      setLangState(urlLang);
      setDict(cached);
      setLangReady(true);
      return;
    }
    loadDictionary(urlLang)
      .then((loaded) => {
        if (languageLoadGenerationRef.current === loadGeneration) {
          setLangState(urlLang);
          setDict(loaded);
          setLangReady(true);
        }
      })
      .catch(() => {
        if (languageLoadGenerationRef.current === loadGeneration) setLangReady(true);
      });
    return () => {
      if (languageLoadGenerationRef.current === loadGeneration) languageLoadGenerationRef.current += 1;
    };
  }, [urlLang, rest, lang, dict]);

  // Loads the stored preference's dictionary and marks `langReady` —
  // deliberately unconditional on the current path (in particular: it must
  // NOT wait for `location.pathname` to move past `/`). SplashEntry's own
  // exit is gated on `langReady`, so if this effect waited for the splash
  // to have already left `/` first, neither side could ever go first —
  // a real deadlock a previous version of this effect had, stuck forever
  // showing the splash's held final frame. The *redirect* decision below is
  // a separate concern that can safely wait; loading the dictionary cannot.
  useEffect(() => {
    if (urlLang) return; // locale-prefixed URL already drives this (lockstep effect above)
    const stored = preferredLanguage();
    if (stored === defaultLang) {
      setLangReady(true);
      return;
    }
    if (lang === stored) return; // already restored (e.g. via setLang)
    const cached = getCachedDictionary(stored);
    if (cached && isRuntimeDictionary(cached)) {
      setLangState(stored);
      setDict(cached);
      setLangReady(true);
      return;
    }
    const loadGeneration = ++languageLoadGenerationRef.current;
    loadDictionary(stored)
      .then((loaded) => {
        if (languageLoadGenerationRef.current !== loadGeneration) return;
        setLangState(stored);
        setDict(loaded);
        setLangReady(true);
      })
      .catch(() => {
        if (languageLoadGenerationRef.current === loadGeneration) setLangReady(true);
      });
    return () => {
      if (languageLoadGenerationRef.current === loadGeneration) languageLoadGenerationRef.current += 1;
    };
  }, [urlLang, lang]);

  // Every bare localizable URL goes to `/{lang}/…` (`/gallery` →
  // `/fr/gallery`, `/creations/ab-cd-123` → `/en/creations/ab-cd-123`).
  // Language is cached `psn-lang`, else the browser/system locale, else
  // English. `/` is skipped: it is the splash placeholder for a cold deep
  // link (prepareSplashColdEntry rewrites the real URL to `/` before React
  // mounts), and prefixing it would send the visitor to `/fr` instead of
  // the page they opened. Already-prefixed URLs and non-localizable paths
  // (admin, OAuth) are left alone. This runs on each bare navigation, not
  // once per load: a single shot was consumed by the first bare URL and
  // later bare links never received a prefix.
  useEffect(() => {
    if (urlLang || location.pathname === '/') return;
    if (!isLocalizablePath(rest)) return;
    const target = `${localizedPath(rest, preferredLanguage())}${location.search}`;
    if (target !== `${location.pathname}${location.search}`) {
      navigate(target, { replace: true });
    }
  }, [urlLang, rest, location.pathname, location.search, navigate]);

  // Only mirrors `lang` onto the <html> tag — localStorage is written
  // explicitly wherever the language actually changes (setLang below), never
  // as a blind side-effect of `lang` here: doing it here writes back the
  // *initial* (default) `lang` before the restore effect above has applied
  // the persisted preference, stomping it back to the default — in dev,
  // React StrictMode's mount→cleanup→remount reliably loses that race, so
  // switching away from the default language never actually stuck.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const nextLang = lang === 'fr' && !frOn ? defaultLang : lang;
    if (nextLang !== lang) {
      setLangState(nextLang);
      savePreferredLanguage(nextLang);
    }
    const assembled = assembleDictionary(en, nextLang, localeEnabled);
    setCachedDictionary(nextLang, assembled);
    setDict(assembled);
  }, [lang, frOn, enablementKey, localeEnabled, catalogsRev]);

  const setLang = useCallback(
    (next: Lang) => {
      savePreferredLanguage(next);
      const loadGeneration = ++languageLoadGenerationRef.current;
      // On a page with a localized URL, changing language is a real
      // navigation — the lockstep effect above picks up `lang`/`dict` once
      // the URL actually lands (see its comment for why that must happen
      // there and not eagerly here too).
      if (isLocalizablePath(rest)) {
        navigate(`${localizedPath(rest, next)}${location.search}`);
        return;
      }
      const cached = getCachedDictionary(next);
      if (cached && isRuntimeDictionary(cached)) {
        setLangState(next);
        setDict(cached);
        setLangReady(true);
        return;
      }
      loadDictionary(next)
        .then((loaded) => {
          if (languageLoadGenerationRef.current !== loadGeneration) return;
          setLangState(next);
          setDict(loaded);
          setLangReady(true);
        })
        .catch(() => {
          if (languageLoadGenerationRef.current !== loadGeneration) return;
          // Keep storage, context and document language coherent when a
          // chunk fails: the current rendered language remains selected.
          savePreferredLanguage(lang);
          setLangReady(true);
        });
    },
    [lang, location.search, navigate, rest],
  );

  // `setLang` is memoized with the current route dependencies above, so the
  // context value only changes when its actual public values change.
  const value = useMemo<LanguageContextValue>(
    () => ({ lang, t: dict, setLang, langReady, availableLanguages }),
    [lang, dict, setLang, langReady, availableLanguages],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within a LanguageProvider');
  return ctx;
}
