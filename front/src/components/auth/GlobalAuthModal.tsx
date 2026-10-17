import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthSession, useAuthPrompt } from '../../state/AuthContext';
import { beginAuthLegalDetour, shouldResumeAuthModalDraft } from '../../state/authConsentDraft';
import { stripLangPrefix } from '../../config/i18nRoutes';
import { useIsDesktopNav } from '../../hooks/useIsDesktopNav';
import { AuthModal } from './AuthModal';

/** Terms / privacy opened from the CGU checkbox — modal stays mounted (hidden)
 * so React state keeps the consent step; remounting was resetting to social. */
function isAuthLegalDetourPath(pathname: string): boolean {
  const { rest } = stripLangPrefix(pathname);
  return rest === '/terms' || rest === '/privacy';
}

/** Full-page /login (and /register) already restore the draft themselves —
 * never stack AuthModal on top of them. */
function isFullPageAuthPath(pathname: string): boolean {
  const { rest } = stripLangPrefix(pathname);
  return rest === '/login' || rest === '/register';
}

/** Cart Identification owns its own CGU / social resume — never open AuthModal. */
function isCartPath(pathname: string): boolean {
  const { rest } = stripLangPrefix(pathname);
  return rest === '/cart';
}

/** Single app-wide instance, mounted once in Layout.tsx — renders whenever
 * something calls promptAuth() (AuthContext), e.g. AccountControl's
 * logged-out "My Account" click or FavoriteButton's logged-out heart click.
 *
 * While /terms|/privacy is open from a consent link, the modal stays mounted
 * but suspended (hidden) so "Accepter les conditions" is still there on back.
 * Cart / login-page drafts never reopen this modal. Desktop only — below
 * 1024px connect uses /login. */
export function GlobalAuthModal() {
  const { status } = useAuthSession();
  const { authPromptMode, authPromptEmail, promptAuth, dismissAuthPrompt } = useAuthPrompt();
  const location = useLocation();
  const isDesktopNav = useIsDesktopNav();
  const onLegalPath = isAuthLegalDetourPath(location.pathname);

  useEffect(() => {
    // Mark detour while the open modal is hidden behind CGU/privacy so
    // useHistoryBackClose does not reclaim (history.back) and wipe the visit.
    if (onLegalPath && authPromptMode) beginAuthLegalDetour();
  }, [onLegalPath, authPromptMode]);

  useEffect(() => {
    if (status === 'loading' || status === 'authenticated') return;
    if (!isDesktopNav) {
      // Leaving desktop must not keep a modal prompt that would pop back on
      // resize when the pending draft belongs to cart Identification.
      if (authPromptMode && !shouldResumeAuthModalDraft()) dismissAuthPrompt();
      return;
    }

    // Stay mounted through a CGU/privacy detour — do not dismiss.
    if (onLegalPath) return;

    if (isFullPageAuthPath(location.pathname) || isCartPath(location.pathname)) return;

    if (!authPromptMode && shouldResumeAuthModalDraft()) {
      promptAuth('login');
    }
  }, [status, isDesktopNav, location.pathname, onLegalPath, authPromptMode, promptAuth, dismissAuthPrompt]);

  if (!authPromptMode) return null;
  return (
    <AuthModal
      initialMode={authPromptMode}
      {...(authPromptEmail ? { initialEmail: authPromptEmail } : {})}
      suspended={onLegalPath}
      onClose={dismissAuthPrompt}
    />
  );
}
