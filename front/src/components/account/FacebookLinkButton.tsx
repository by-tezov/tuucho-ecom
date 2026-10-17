import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { shopConfig } from '../../config/env';
import { loadFacebookSdk } from '../../utils/loadFacebookSdk';
import { useLang } from '../../assets/i18n';
import {
  beginFacebookOAuthReturn,
  createFacebookOAuthState,
  facebookBrowserOAuthUrl,
  facebookLoginDialogOptions,
  isFacebookMobileBrowser,
  takeFacebookOAuthReturnPending,
} from '../../state/facebookOAuthReturn';
import facebookIconUrl from '../../assets/images/brand/facebook-f.svg';
import socialButtonStyles from '../auth/SocialSignInButton.module.css';

interface FacebookLinkButtonProps {
  onCredential: (accessToken: string) => void;
  disabled?: boolean;
  onUnavailable?: () => void;
  /** Mobile only: direct web OAuth when true; desktop always uses FB.login. */
  mobileDirectOAuthEnabled?: boolean;
}

/** Facebook Login button for linking to an already-signed-in account. */
export function FacebookLinkButton({
  onCredential,
  disabled = false,
  onUnavailable,
  mobileDirectOAuthEnabled = true,
}: FacebookLinkButtonProps) {
  const { t } = useLang();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const unavailableNotifiedRef = useRef(false);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const appId = shopConfig.facebookAppId;
  const mobileBrowser = isFacebookMobileBrowser();

  const notifyUnavailable = useCallback(() => {
    if (unavailableNotifiedRef.current) return;
    unavailableNotifiedRef.current = true;
    onUnavailableRef.current?.();
  }, []);

  useEffect(() => {
    if (appId) return;
    notifyUnavailable();
  }, [appId, notifyUnavailable]);

  useEffect(() => {
    if (!appId || disabled) return;
    if (mobileBrowser && mobileDirectOAuthEnabled) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await loadFacebookSdk(appId);
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) notifyUnavailable();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId, disabled, mobileBrowser, mobileDirectOAuthEnabled, notifyUnavailable]);

  if (!appId || disabled || !ready) return null;

  function startLogin() {
    const directOauthState =
      mobileBrowser && mobileDirectOAuthEnabled ? createFacebookOAuthState() : undefined;
    beginFacebookOAuthReturn({
      resumePath: `${location.pathname}${location.search}`,
      purpose: 'link',
      ...(directOauthState ? { oauthState: directOauthState } : {}),
    });

    if (mobileBrowser && mobileDirectOAuthEnabled) {
      const url = facebookBrowserOAuthUrl(directOauthState!);
      if (!url) {
        notifyUnavailable();
        return;
      }
      window.location.assign(url);
      return;
    }

    if (!window.FB) {
      notifyUnavailable();
      return;
    }
    window.FB.login((response) => {
      const token = response.authResponse?.accessToken;
      if (token) {
        takeFacebookOAuthReturnPending();
        onCredentialRef.current(token);
      }
    }, facebookLoginDialogOptions());
  }

  return (
    <button
      type="button"
      className={socialButtonStyles.socialButton}
      data-provider="facebook"
      onClick={startLogin}
      data-testid="account-facebook-link-button"
    >
      <img src={facebookIconUrl} alt="" width={20} height={20} decoding="async" />
      <span>{t.account.signInMethodFacebookLinkButton}</span>
    </button>
  );
}
