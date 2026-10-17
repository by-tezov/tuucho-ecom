import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { shopConfig } from '../../config/env';
import { loadGoogleIdentityScript } from '../../utils/loadGoogleIdentityScript';
import googleIconUrl from '../../assets/images/brand/google-g.svg';
import styles from '../auth/GoogleSignInBlock.module.css';
import socialButtonStyles from '../auth/SocialSignInButton.module.css';

interface GoogleLinkButtonProps {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
  onUnavailable?: () => void;
}

/** Minimal GIS button for linking Google to an already-signed-in account.
 * Does not run login/signup — parent calls POST /account/link-google. */
export function GoogleLinkButton({ onCredential, disabled = false, onUnavailable }: GoogleLinkButtonProps) {
  const { t, lang } = useLang();
  const hiddenGoogleButtonHostRef = useRef<HTMLDivElement | null>(null);
  const unavailableNotifiedRef = useRef(false);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const [sdkReady, setSdkReady] = useState(false);

  const clientId = shopConfig.googleClientId;
  const enabled = Boolean(clientId) && !disabled;

  const notifyUnavailable = useCallback(() => {
    if (unavailableNotifiedRef.current) return;
    unavailableNotifiedRef.current = true;
    onUnavailableRef.current?.();
  }, []);

  // Only treat missing client id as permanently unavailable — parent `disabled`
  // (submitting / choice modal) must not hide the Account Google block.
  useEffect(() => {
    if (clientId) return;
    notifyUnavailable();
  }, [clientId, notifyUnavailable]);

  useEffect(() => {
    if (!enabled || !clientId) return;
    let cancelled = false;
    const host = hiddenGoogleButtonHostRef.current;
    if (!host) return;

    function paintButton() {
      if (cancelled || !hiddenGoogleButtonHostRef.current || !clientId) return;
      const google = window.google?.accounts?.id;
      if (!google) return;
      const hostEl = hiddenGoogleButtonHostRef.current;
      hostEl.replaceChildren();
      google.initialize({
        client_id: clientId,
        callback: (response) => {
          const token = response.credential;
          if (token) onCredentialRef.current(token);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      const width = Math.min(400, Math.floor(hostEl.parentElement?.getBoundingClientRect().width ?? 400));
      google.renderButton(hostEl, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: width > 0 ? width : 400,
        locale: lang,
      });
      if (!cancelled) setSdkReady(true);
    }

    void (async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled) return;
        paintButton();
      } catch {
        if (!cancelled) notifyUnavailable();
      }
    })();

    return () => {
      cancelled = true;
      setSdkReady(false);
    };
  }, [clientId, enabled, lang, notifyUnavailable]);

  if (!clientId || !enabled) return null;

  return (
    <div className={styles.buttonHost} data-testid="account-google-link-button">
      {sdkReady && (
        <button
          type="button"
          className={`${socialButtonStyles.socialButton} ${styles.customGoogleButton}`}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
        >
          <img src={googleIconUrl} alt="" width={20} height={20} decoding="async" />
          <span>{t.auth.continueWithGoogle}</span>
        </button>
      )}
      <div
        ref={hiddenGoogleButtonHostRef}
        className={`${styles.hiddenGoogleButtonHost}${disabled ? ` ${styles.hiddenGoogleButtonHostDisabled}` : ''}`}
      />
    </div>
  );
}
