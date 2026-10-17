import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthCommands } from '../state/AuthContext';
import { isAppleSignInNeedsConsent, isSocialSignInNeedsAccountChoice } from '../api/identity';
import { isBackendUnavailableError } from '../api/http';
import { useLang } from '../assets/i18n';
import { authReturnTo } from '../state/authCredentialsState';
import { LoadingModal } from '../components/ui/LoadingModal';
import { Seo } from '../components/seo/Seo';
import { stripLangPrefix } from '../config/i18nRoutes';
import {
  stashAppleLinkCredential,
  takeAppleOAuthReturnBridge,
  takeAppleOAuthReturnPending,
} from '../state/appleOAuthReturn';
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

/** Apple form_post bridge target — validates the returned state, finishes
 * Apple Login with the API, then resumes the page that started the flow. */
export function AppleReturnPage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const { signInWithApple } = useAuthCommands();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const pending = takeAppleOAuthReturnPending();
    const resumePath = pending?.resumePath ?? '/';
    const bridge = takeAppleOAuthReturnBridge();

    if (!pending || !bridge || !bridge.idToken || bridge.error || bridge.state !== pending.state) {
      navigate(resumePath, { replace: true });
      return;
    }

    const idToken = bridge.idToken;

    if (pending.purpose === 'link') {
      if (!pending.unlockToken) {
        navigate(resumePath, { replace: true });
        return;
      }
      stashAppleLinkCredential({ idToken, unlockToken: pending.unlockToken, nonce: pending.nonce });
      navigate(resumePath, { replace: true });
      return;
    }

    void (async () => {
      try {
        const result = await signInWithApple({
          idToken,
          nonce: pending.nonce,
          ...(pending.gdprAccepted !== undefined ? { gdprAccepted: pending.gdprAccepted } : {}),
          ...(pending.rememberMe !== undefined ? { rememberMe: pending.rememberMe } : {}),
          language: pending.language ?? lang,
        });
        if (isAppleSignInNeedsConsent(result)) {
          saveAuthConsentDraft({
            appleSignupToken: result.appleSignupToken,
            ...(pending.rememberMe !== undefined ? { rememberMe: pending.rememberMe } : {}),
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
            rememberMe: pending.rememberMe ?? false,
            surface: draftSurfaceForResume(resumePath),
          });
          navigate(resumePath, { replace: true });
          return;
        }
        if (isLoginResumePath(resumePath)) {
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
  }, [lang, navigate, signInWithApple]);

  return (
    <>
      <Seo title={t.auth.loadingLogin} description={t.auth.loadingLogin} path="/auth/apple-return" noindex />
      <LoadingModal message={t.auth.loadingLogin} />
    </>
  );
}
