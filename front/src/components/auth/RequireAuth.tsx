import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthSession } from '../../state/AuthContext';
import { useLang } from '../../assets/i18n';
import { localizedPath, stripLangPrefix } from '../../config/i18nRoutes';
import { authReturnTo } from '../../state/authCredentialsState';
import { useIsDesktopNav } from '../../hooks/useIsDesktopNav';
import { defaultSplashDestination } from '../../state/splashEntryGate';
import { MainAreaFallback } from '../layout/MainAreaFallback';

/** Guards /account and /account/addresses — anonymous visitors are sent to
 * Accueil (desktop) or gallery (mobile), matching the post-splash default;
 * 'loading' covers the brief window while the silent refresh-on-load in
 * AuthContext is still settling, so a logged-in user landing directly on
 * /account from a bookmark/email link doesn't get bounced before their
 * session restores (after the entry splash resumes that deep link). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuthSession();
  const isDesktop = useIsDesktopNav();
  const location = useLocation();
  const { lang } = useLang();
  // The URL's own prefix, not the context's `lang`: right after the splash
  // resumes onto a locale-prefixed deep link (e.g. /nl/orders), this guard
  // can render before LanguageProvider's own effect has caught `lang` up to
  // that URL — reading `lang` here raced that catch-up and sent an
  // anonymous visitor to e.g. /en/home instead of /nl/home. The URL segment
  // itself is available synchronously, so prefer it whenever present.
  const effectiveLang = stripLangPrefix(location.pathname).lang ?? lang;

  if (status === 'loading') return <MainAreaFallback />;
  if (status === 'anonymous') {
    return <Navigate to={localizedPath(defaultSplashDestination(isDesktop), effectiveLang)} replace />;
  }
  return <>{children}</>;
}

/** Guards /login — a signed-in visitor (or browser
 * back after signup) must not see auth forms again; send them home. */
export function RequireAnonymous({ children }: { children: ReactNode }) {
  const { status } = useAuthSession();
  const location = useLocation();
  const { lang } = useLang();
  // See RequireAuth's comment: the URL's own lang segment is authoritative
  // and race-free, unlike context `lang` right after a fresh navigation.
  const effectiveLang = stripLangPrefix(location.pathname).lang ?? lang;

  if (status === 'loading') return <MainAreaFallback />;
  if (status === 'authenticated') {
    return <Navigate to={authReturnTo(location.state, effectiveLang)} replace />;
  }
  return <>{children}</>;
}
