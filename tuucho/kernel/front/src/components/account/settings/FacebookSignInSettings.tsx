import { useEffect, useRef, useState } from 'react';
import * as authApi from '../../../api/account';
import { ApiError } from '../../../api/errors';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../../../api/http';
import { shopConfig } from '../../../config/env';
import { withMinDuration } from '../../../utils/withMinDuration';
import { useSectionUnlock, type SectionUnlock } from '../../../hooks/useSectionUnlock';
import { SectionUnlockButton, SectionUnlockPrompt } from '../SectionUnlockControl';
import { SocialSignInRow } from '../../ui/SocialSignInRow';
import { LoadingModal } from '../../ui/LoadingModal';
import authFormStyles from '../../auth/AuthForm.module.css';
import styles from './AccountSettings.module.css';
import type { AccountUserSectionProps } from './accountSettingsTypes';

import { FacebookLinkButton } from '../FacebookLinkButton';
import { SocialUnlinkButton } from '../SocialUnlinkButton';
import { GoogleEmailChoiceModal } from '../GoogleEmailChoiceModal';
import { takeFacebookLinkAccessToken } from '../../../state/facebookOAuthReturn';
import facebookIconUrl from '../../../assets/images/brand/facebook-f.svg';

export interface FacebookSignInSettingsProps extends AccountUserSectionProps {
  embedded?: boolean;
  sharedUnlock?: SectionUnlock;
  facebookOffered?: boolean;
  onFacebookOfferedChange?: (offered: boolean) => void;
  facebookMobileDirectOAuthEnabled?: boolean;
}

export function FacebookSignInSettings({
  embedded = false,
  sharedUnlock,
  facebookOffered: facebookOfferedControlled,
  onFacebookOfferedChange,
  facebookMobileDirectOAuthEnabled = true,
  t,
  user,
  setUser,
  authedRequest,
}: FacebookSignInSettingsProps) {
  const hasPassword = user.hasPassword !== false;
  const hasFacebook = user.hasFacebook === true;
  const facebookEmail = user.facebookEmail?.trim() || null;
  const [facebookOfferedInternal, setFacebookOfferedInternal] = useState(false);
  const facebookOffered = facebookOfferedControlled ?? facebookOfferedInternal;
  const setFacebookOffered = onFacebookOfferedChange ?? setFacebookOfferedInternal;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<'link' | 'unlink' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailChoice, setEmailChoice] = useState<{
    facebookLinkToken: string;
    currentEmail: string;
    facebookEmail: string;
  } | null>(null);
  const ownUnlock = useSectionUnlock('facebook', authedRequest, hasPassword);
  const unlock = embedded && sharedUnlock ? sharedUnlock : ownUnlock;
  const facebookToken = unlock.token;

  const frozenViewRef = useRef({
    hasFacebook,
    facebookEmail,
  });
  if (!submitting) {
    frozenViewRef.current = { hasFacebook, facebookEmail };
  }
  const displayHasFacebook = submitting ? frozenViewRef.current.hasFacebook : hasFacebook;
  const displayFacebookEmail = submitting ? frozenViewRef.current.facebookEmail : facebookEmail;

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(null), shopConfig.noticeMs);
    return () => clearTimeout(timeout);
  }, [success]);

  function linkErrorMessage(code: string): string {
    switch (code) {
      case 'facebook_already_linked':
        return t.account.errorFacebookAlreadyLinked;
      case 'facebook_email_required':
        return t.auth.errorFacebookEmailRequired;
      case 'email_change_pending':
        return t.account.errorEmailChangePending;
      case 'email_already_used':
        return t.account.errorEmailAlreadyUsed;
      case 'invalid_or_expired_token':
        return t.auth.otpInvalidError;
      case 'invalid_facebook_token':
        return t.auth.errorFacebookToken;
      case 'facebook_sign_in_disabled':
      case 'sign_in_method_forbidden':
        return t.auth.errorFacebookDisabled;
      case 'unlock_invalid':
        return t.auth.errorUnlockInvalid;
      case 'rate_limited':
      case 'request_timeout':
        return t.auth.authServiceBusy;
      default:
        return t.auth.errorGeneric;
    }
  }

  async function handleCredential(accessToken: string) {
    if (!facebookToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) => authApi.linkFacebookAccount(token, accessToken, facebookToken!)),
        shopConfig.loadingMinMs.normal,
      );
      if (authApi.isLinkFacebookNeedsEmailChoice(result)) {
        setEmailChoice({
          facebookLinkToken: result.facebookLinkToken,
          currentEmail: result.currentEmail,
          facebookEmail: result.facebookEmail,
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
      if (code === 'facebook_sign_in_disabled' || code === 'sign_in_method_forbidden') {
        setFacebookOffered(false);
        return;
      }
      setError(linkErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  const handleCredentialRef = useRef(handleCredential);
  handleCredentialRef.current = handleCredential;

  useEffect(() => {
    if (!facebookToken || hasFacebook) return;
    const pending = takeFacebookLinkAccessToken();
    if (!pending) return;
    void handleCredentialRef.current(pending);
    // Resume link after in-app Facebook redirect when section is still unlocked.
  }, [facebookToken, hasFacebook]);

  async function handleEmailChoice(choice: 'keep' | 'switch') {
    if (!facebookToken || !emailChoice) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          authApi.completeFacebookLink(token, emailChoice.facebookLinkToken, choice, facebookToken!),
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
    if (!facebookToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) => authApi.unlinkFacebookAccount(token, facebookToken!)),
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

  if (!embedded && !displayHasFacebook && !facebookOffered) return null;

  const showLinkAction = !displayHasFacebook && unlock.unlocked && facebookOffered;
  const showUnlinkAction = displayHasFacebook && unlock.unlocked;
  const unavailable = embedded && !displayHasFacebook && !facebookOffered;
  const rootClassName = embedded ? styles.socialSignInPane : `${styles.block} ${styles.googleBlock}`;

  return (
    <div
      className={rootClassName}
      data-testid={embedded ? 'account-sign-in-methods-facebook' : 'account-facebook-sign-in'}
    >
      {embedded ? (
        <SocialSignInRow
          iconSrc={facebookIconUrl}
          name={t.account.facebookEmailSecondaryLabel}
          hint={
            displayHasFacebook && displayFacebookEmail
              ? displayFacebookEmail
              : unavailable
                ? t.account.signInMethodUnavailable
                : t.account.signInMethodFacebookPaneHint
          }
          status={displayHasFacebook ? 'linked' : unavailable ? 'unavailable' : undefined}
          statusLabel={
            displayHasFacebook
              ? t.account.signInMethodFacebookLinked
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
                src={facebookIconUrl}
                alt=""
                width={28}
                height={28}
                decoding="async"
              />
              <h2 className={styles.blockTitle}>{t.account.signInMethodsFacebookTitle}</h2>
              {displayHasFacebook && (
                <span className={`${styles.badge} ${styles.badgeVerified}`}>
                  {t.account.signInMethodFacebookLinked}
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
            {displayHasFacebook
              ? t.account.signInMethodFacebookLinkedHint
              : t.account.signInMethodFacebookLinkHint}
          </p>
        )}
        {error && (
          <p className={authFormStyles.fieldError} role="alert">
            {error}
          </p>
        )}
        {success === 'link' && (
          <p className={authFormStyles.success} role="status">
            {t.account.signInMethodFacebookLinkSuccess}
          </p>
        )}
        {success === 'unlink' && (
          <p className={authFormStyles.success} role="status">
            {t.account.signInMethodFacebookUnlinkSuccess}
          </p>
        )}
        {showLinkAction && (
          <FacebookLinkButton
            disabled={submitting || emailChoice != null}
            onCredential={handleCredential}
            onUnavailable={() => setFacebookOffered(false)}
            mobileDirectOAuthEnabled={facebookMobileDirectOAuthEnabled}
          />
        )}
        {showUnlinkAction && (
          <SocialUnlinkButton
            provider="facebook"
            disabled={submitting}
            onClick={() => void handleUnlink()}
            testId="account-facebook-unlink"
          >
            {t.account.signInMethodFacebookUnlinkButton}
          </SocialUnlinkButton>
        )}
      </div>
      {emailChoice && (
        <GoogleEmailChoiceModal
          title={t.account.facebookEmailChoiceTitle}
          message={t.account.facebookEmailChoiceMessage}
          currentEmail={emailChoice.currentEmail}
          providerEmail={emailChoice.facebookEmail}
          keepLabel={t.account.facebookEmailChoiceKeep}
          switchLabel={t.account.facebookEmailChoiceSwitch}
          closeLabel={t.account.unlockCancelButton}
          busy={submitting}
          testId="account-facebook-email-choice"
          onKeep={() => void handleEmailChoice('keep')}
          onSwitch={() => void handleEmailChoice('switch')}
          onCancel={() => setEmailChoice(null)}
        />
      )}
      {submitting && <LoadingModal message={t.auth.loadingLogin} />}
    </div>
  );
}
