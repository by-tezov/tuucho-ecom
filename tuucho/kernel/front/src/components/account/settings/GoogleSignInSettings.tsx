import { useEffect, useRef, useState } from 'react';
import * as authApi from '../../../api/account';
import { ApiError } from '../../../api/errors';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../../../api/http';
import { shopConfig } from '../../../config/env';
import { withMinDuration } from '../../../utils/withMinDuration';
import { useSectionUnlock, type SectionUnlock } from '../../../hooks/useSectionUnlock';
import { SectionUnlockButton, SectionUnlockPrompt } from '../SectionUnlockControl';
import { LoadingModal } from '../../ui/LoadingModal';
import authFormStyles from '../../auth/AuthForm.module.css';
import styles from './AccountSettings.module.css';
import type { AccountUserSectionProps } from './accountSettingsTypes';

import { GoogleLinkButton } from '../GoogleLinkButton';
import { SocialUnlinkButton } from '../SocialUnlinkButton';
import { GoogleEmailChoiceModal } from '../GoogleEmailChoiceModal';
import { SocialSignInRow } from '../../ui/SocialSignInRow';
import googleGIconUrl from '../../../assets/images/brand/google-g.svg';

export interface GoogleSignInSettingsProps extends AccountUserSectionProps {
  embedded?: boolean;
  sharedUnlock?: SectionUnlock;
  googleOffered?: boolean;
  onGoogleOfferedChange?: (offered: boolean) => void;
}

export function GoogleSignInSettings({
  embedded = false,
  sharedUnlock,
  googleOffered: googleOfferedControlled,
  onGoogleOfferedChange,
  t,
  user,
  setUser,
  authedRequest,
}: GoogleSignInSettingsProps) {
  const hasPassword = user.hasPassword !== false;
  const hasGoogle = user.hasGoogle === true;
  const googleEmail = user.googleEmail?.trim() || null;
  const [googleOfferedInternal, setGoogleOfferedInternal] = useState(false);
  const googleOffered = googleOfferedControlled ?? googleOfferedInternal;
  const setGoogleOffered = onGoogleOfferedChange ?? setGoogleOfferedInternal;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<'link' | 'unlink' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailChoice, setEmailChoice] = useState<{
    googleLinkToken: string;
    currentEmail: string;
    googleEmail: string;
  } | null>(null);
  const ownUnlock = useSectionUnlock('google', authedRequest, hasPassword);
  const unlock = embedded && sharedUnlock ? sharedUnlock : ownUnlock;
  const googleToken = unlock.token;

  // Freeze linked chrome while the request runs so the block does not flash
  // unlinked/linked mid-flight under the loading modal.
  const frozenViewRef = useRef({
    hasGoogle,
    googleEmail,
  });
  if (!submitting) {
    frozenViewRef.current = { hasGoogle, googleEmail };
  }
  const displayHasGoogle = submitting ? frozenViewRef.current.hasGoogle : hasGoogle;
  const displayGoogleEmail = submitting ? frozenViewRef.current.googleEmail : googleEmail;

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(null), shopConfig.noticeMs);
    return () => clearTimeout(timeout);
  }, [success]);

  function linkErrorMessage(code: string): string {
    switch (code) {
      case 'google_email_mismatch':
        return t.account.errorGoogleEmailMismatch;
      case 'google_already_linked':
        return t.account.errorGoogleAlreadyLinked;
      case 'email_change_pending':
        return t.account.errorEmailChangePending;
      case 'email_already_used':
        return t.account.errorEmailAlreadyUsed;
      case 'invalid_or_expired_token':
        return t.auth.otpInvalidError;
      case 'invalid_google_token':
        return t.auth.errorGoogleToken;
      case 'google_sign_in_disabled':
      case 'sign_in_method_forbidden':
        return t.auth.errorGoogleDisabled;
      case 'unlock_invalid':
        return t.auth.errorUnlockInvalid;
      case 'rate_limited':
      case 'request_timeout':
        return t.auth.authServiceBusy;
      default:
        return t.auth.errorGeneric;
    }
  }

  async function handleCredential(idToken: string) {
    if (!googleToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) => authApi.linkGoogleAccount(token, idToken, googleToken!)),
        shopConfig.loadingMinMs.normal,
      );
      if (authApi.isLinkGoogleNeedsEmailChoice(result)) {
        setEmailChoice({
          googleLinkToken: result.googleLinkToken,
          currentEmail: result.currentEmail,
          googleEmail: result.googleEmail,
        });
        return;
      }
      setUser(result.user);
      unlock.consume();
      setSuccess('link');
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      if (code === 'google_sign_in_disabled' || code === 'sign_in_method_forbidden') {
        setGoogleOffered(false);
        return;
      }
      setError(linkErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmailChoice(choice: 'keep' | 'switch') {
    if (!googleToken || !emailChoice) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          authApi.completeGoogleLink(token, emailChoice.googleLinkToken, choice, googleToken!),
        ),
        shopConfig.loadingMinMs.normal,
      );
      setEmailChoice(null);
      setUser(result.user);
      unlock.consume();
      setSuccess('link');
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      setError(linkErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlink() {
    if (!googleToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) => authApi.unlinkGoogleAccount(token, googleToken!)),
        shopConfig.loadingMinMs.normal,
      );
      setUser(result.user);
      unlock.consume();
      setSuccess('unlink');
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      setError(linkErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  if (!embedded && !displayHasGoogle && !googleOffered) return null;

  const showLinkAction = !displayHasGoogle && unlock.unlocked && googleOffered;
  const showUnlinkAction = displayHasGoogle && unlock.unlocked;
  const unavailable = embedded && !displayHasGoogle && !googleOffered;
  const rootClassName = embedded ? styles.socialSignInPane : `${styles.block} ${styles.googleBlock}`;

  return (
    <div
      className={rootClassName}
      data-testid={embedded ? 'account-sign-in-methods-google' : 'account-sign-in-methods'}
    >
      {embedded ? (
        <SocialSignInRow
          iconSrc={googleGIconUrl}
          name={t.account.googleEmailSecondaryLabel}
          hint={
            displayHasGoogle && displayGoogleEmail
              ? displayGoogleEmail
              : unavailable
                ? t.account.signInMethodUnavailable
                : t.account.signInMethodGooglePaneHint
          }
          status={displayHasGoogle ? 'linked' : unavailable ? 'unavailable' : undefined}
          statusLabel={
            displayHasGoogle
              ? t.account.signInMethodGoogleLinked
              : unavailable
                ? t.account.signInMethodUnavailableChip
                : undefined
          }
        />
      ) : (
        <>
          <div className={styles.blockHeader}>
            <div className={styles.blockTitleRow}>
              <img
                className={styles.googleBrandIcon}
                src={googleGIconUrl}
                alt=""
                width={28}
                height={28}
                decoding="async"
              />
              <h2 className={styles.blockTitle}>{t.account.signInMethodsTitle}</h2>
              {displayHasGoogle && (
                <span className={`${styles.badge} ${styles.badgeVerified}`}>
                  {t.account.signInMethodGoogleLinked}
                </span>
              )}
            </div>
            <SectionUnlockButton unlock={unlock} />
          </div>
          {unlock.confirming && <SectionUnlockPrompt unlock={unlock} />}
        </>
      )}
      <div className={styles.googleLinkPanel}>
        {!embedded && (
          <p className={styles.passwordlessHint}>
            {displayHasGoogle ? t.account.signInMethodGoogleLinkedHint : t.account.signInMethodGoogleLinkHint}
          </p>
        )}
        {error && (
          <p className={authFormStyles.fieldError} role="alert">
            {error}
          </p>
        )}
        {success === 'link' && (
          <p className={authFormStyles.success} role="status">
            {t.account.signInMethodGoogleLinkSuccess}
          </p>
        )}
        {success === 'unlink' && (
          <p className={authFormStyles.success} role="status">
            {t.account.signInMethodGoogleUnlinkSuccess}
          </p>
        )}
        {showLinkAction && (
          <GoogleLinkButton
            disabled={submitting || emailChoice != null}
            onCredential={handleCredential}
            onUnavailable={() => setGoogleOffered(false)}
          />
        )}
        {showUnlinkAction && (
          <SocialUnlinkButton
            provider="google"
            disabled={submitting}
            onClick={() => void handleUnlink()}
            testId="account-google-unlink"
          >
            {t.account.signInMethodGoogleUnlinkButton}
          </SocialUnlinkButton>
        )}
      </div>
      {emailChoice && (
        <GoogleEmailChoiceModal
          title={t.account.googleEmailChoiceTitle}
          message={t.account.googleEmailChoiceMessage}
          currentEmail={emailChoice.currentEmail}
          providerEmail={emailChoice.googleEmail}
          keepLabel={t.account.googleEmailChoiceKeep}
          switchLabel={t.account.googleEmailChoiceSwitch}
          closeLabel={t.account.unlockCancelButton}
          busy={submitting}
          onKeep={() => void handleEmailChoice('keep')}
          onSwitch={() => void handleEmailChoice('switch')}
          onCancel={() => setEmailChoice(null)}
        />
      )}
      {submitting && <LoadingModal message={t.auth.loadingLogin} />}
    </div>
  );
}
