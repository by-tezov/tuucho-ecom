import { useCallback, useEffect, useRef, useState } from 'react';
import { shopConfig } from '../../config/env';
import { loadAppleAuthScript } from '../../utils/loadAppleAuthScript';
import { createAppleSignInNonce } from '../../utils/appleNonce';
import { useLang } from '../../assets/i18n';
import appleIconUrl from '../../assets/images/brand/apple.svg';
import socialButtonStyles from '../auth/SocialSignInButton.module.css';

interface AppleLinkButtonProps {
  onCredential: (idToken: string, nonce: string) => void;
  disabled?: boolean;
  onUnavailable?: () => void;
}

function appleRedirectUri(): string {
  return shopConfig.appleRedirectUri.replace(/\/$/, '');
}

function newAppleState(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `apple-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Sign in with Apple button for linking to an already-signed-in account.
 * Does not run login/signup — parent calls POST /account/link-apple. */
export function AppleLinkButton({ onCredential, disabled = false, onUnavailable }: AppleLinkButtonProps) {
  const { t } = useLang();
  const [ready, setReady] = useState(false);
  const unavailableNotifiedRef = useRef(false);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const initStateRef = useRef(newAppleState());
  const nonceRawRef = useRef<string | null>(null);
  const clientId = shopConfig.appleClientId;

  const notifyUnavailable = useCallback(() => {
    if (unavailableNotifiedRef.current) return;
    unavailableNotifiedRef.current = true;
    onUnavailableRef.current?.();
  }, []);

  useEffect(() => {
    if (clientId) return;
    notifyUnavailable();
  }, [clientId, notifyUnavailable]);

  useEffect(() => {
    if (!clientId || disabled) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadAppleAuthScript();
        if (cancelled || !window.AppleID?.auth) {
          if (!cancelled) notifyUnavailable();
          return;
        }
        const { raw, hashed } = await createAppleSignInNonce();
        if (cancelled) return;
        nonceRawRef.current = raw;
        window.AppleID.auth.init({
          clientId,
          scope: 'name email',
          redirectURI: appleRedirectUri(),
          usePopup: true,
          state: initStateRef.current,
          nonce: hashed,
        });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) notifyUnavailable();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, disabled, notifyUnavailable]);

  if (!clientId || disabled || !ready) return null;

  function startSignIn() {
    if (!window.AppleID?.auth) {
      notifyUnavailable();
      return;
    }
    const nonce = nonceRawRef.current;
    if (!nonce) {
      notifyUnavailable();
      return;
    }
    // Must run from this click handler — Apple popup requires a user gesture.
    void window.AppleID.auth
      .signIn()
      .then((response) => {
        const token = response.authorization?.id_token;
        if (token) onCredentialRef.current(token, nonce);
      })
      .catch(() => {
        // User closed the popup — no error banner.
      });
  }

  return (
    <button
      type="button"
      className={socialButtonStyles.socialButton}
      data-provider="apple"
      onClick={startSignIn}
      data-testid="account-apple-link-button"
    >
      <img src={appleIconUrl} alt="" width={20} height={20} decoding="async" />
      <span>{t.account.signInMethodAppleLinkButton}</span>
    </button>
  );
}
