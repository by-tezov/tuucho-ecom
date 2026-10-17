import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthCommands } from '../state/AuthContext';
import { isFacebookSignInNeedsConsent, isSocialSignInNeedsAccountChoice } from '../api/identity';
import { isBackendUnavailableError } from '../api/http';
import { useLang } from '../assets/i18n';
import { authReturnTo } from '../state/authCredentialsState';
import { LoadingModal } from '../components/ui/LoadingModal';
import { Seo } from '../components/seo/Seo';
import { stripLangPrefix } from '../config/i18nRoutes';
import {
  clearFacebookRedirectResidue,
  parseFacebookRedirectResponse,
  stashFacebookLinkAccessToken,
  takeFacebookOAuthReturnPending,
} from '../state/facebookOAuthReturn';
import {
  patchAuthConsentDraft,
  saveAuthConsentDraft,
  type AuthConsentDraftSurface,
} from '../state/authConsentDraft';

function isLoginResumePath(path: string): boolean {
  const { rest } = stripLangPrefix(path.split('?')[0] || path);
  return rest === '/login';
}

function draftSurfaceForResume(path: string): AuthConsentDraftSurface {
  const { rest } = stripLangPrefix(path.split('?')[0] || path);
  if (rest === '/cart') return 'cart';
  if (rest === '/login') return 'login-page';
  return 'auth-modal';
}

/** Meta fallback_redirect_uri target — finishes Facebook Login after an
 * in-app-browser full-page redirect, then sends the visitor back. */
export function FacebookReturnPage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const { signInWithFacebook } = useAuthCommands();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const pending = takeFacebookOAuthReturnPending();
    const resumePath = pending?.resumePath?.startsWith('/') ? pending.resumePath : '/';
    const { accessToken, denied, oauthState } = parseFacebookRedirectResponse();
    clearFacebookRedirectResidue();

    // No callback is valid unless this browser started the flow. Direct web
    // OAuth additionally requires its exact nonce; the SDK fallback keeps a
    // pending context but owns its own state internally.
    const invalidOAuthContext =
      !pending || (pending.oauthState !== undefined && oauthState !== pending.oauthState);
    if (!accessToken || denied || invalidOAuthContext) {
      navigate(resumePath, { replace: true });
      return;
    }

    if (pending?.purpose === 'link') {
      stashFacebookLinkAccessToken(accessToken);
      navigate(resumePath, { replace: true });
      return;
    }

    void (async () => {
      try {
        const result = await signInWithFacebook({
          accessToken,
          ...(pending?.rememberMe !== undefined ? { rememberMe: pending.rememberMe } : {}),
          language: pending?.language ?? lang,
        });
        if (isFacebookSignInNeedsConsent(result)) {
          saveAuthConsentDraft({
            facebookSignupToken: result.facebookSignupToken,
            ...(pending?.rememberMe !== undefined ? { rememberMe: pending.rememberMe } : {}),
            surface: draftSurfaceForResume(resumePath),
          });
          navigate(resumePath, { replace: true });
          return;
        }
        if (isSocialSignInNeedsAccountChoice(result)) {
          patchAuthConsentDraft({
            socialPendingToken: result.socialPendingToken,
            socialProvider: result.provider,
            socialEmail: result.socialEmail,
            socialChoiceStep: 'choice',
            rememberMe: pending?.rememberMe ?? false,
            surface: draftSurfaceForResume(resumePath),
          });
          navigate(resumePath, { replace: true });
          return;
        }
        if (pending && isLoginResumePath(resumePath)) {
          const state = pending.authReturnTo ? { returnTo: pending.authReturnTo } : undefined;
          navigate(authReturnTo(state, pending.language ?? lang), { replace: true, state });
          return;
        }
        navigate(resumePath, { replace: true });
      } catch (err) {
        if (isBackendUnavailableError(err)) {
          navigate(resumePath, { replace: true });
          return;
        }
        navigate(resumePath, { replace: true });
      }
    })();
  }, [lang, navigate, signInWithFacebook]);

  return (
    <>
      <Seo
        title={t.auth.loadingLogin}
        description={t.auth.loadingLogin}
        path="/auth/facebook-return"
        noindex
      />
      <LoadingModal message={t.auth.loadingLogin} />
    </>
  );
}
