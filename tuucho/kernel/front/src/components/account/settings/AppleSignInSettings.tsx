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

import { AppleLinkButton } from '../AppleLinkButton';
import { SocialUnlinkButton } from '../SocialUnlinkButton';
import { GoogleEmailChoiceModal } from '../GoogleEmailChoiceModal';
import { takeAppleLinkCredential } from '../../../state/appleOAuthReturn';
import appleIconUrl from '../../../assets/images/brand/apple.svg';

export interface AppleSignInSettingsProps extends AccountUserSectionProps {
  embedded?: boolean;
  sharedUnlock?: SectionUnlock;
  appleOffered?: boolean;
  onAppleOfferedChange?: (offered: boolean) => void;
}

export function AppleSignInSettings({
  embedded = false,
  sharedUnlock,
  appleOffered: appleOfferedControlled,
  onAppleOfferedChange,
  t,
  user,
  setUser,
  authedRequest,
}: AppleSignInSettingsProps) {
  const hasPassword = user.hasPassword !== false;
  const hasApple = user.hasApple === true;
  const appleEmail = user.appleEmail?.trim() || null;
  const [appleOfferedInternal, setAppleOfferedInternal] = useState(false);
  const appleOffered = appleOfferedControlled ?? appleOfferedInternal;
  const setAppleOffered = onAppleOfferedChange ?? setAppleOfferedInternal;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<'link' | 'unlink' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailChoice, setEmailChoice] = useState<{
    appleLinkToken: string;
    currentEmail: string;
    appleEmail: string;
  } | null>(null);
  const ownUnlock = useSectionUnlock('apple', authedRequest, hasPassword);
  const unlock = embedded && sharedUnlock ? sharedUnlock : ownUnlock;
  const appleToken = unlock.token;
  const [appleLinkToken, setAppleLinkToken] = useState<string | null>(null);

  const frozenViewRef = useRef({
    hasApple,
    appleEmail,
  });
  if (!submitting) {
    frozenViewRef.current = { hasApple, appleEmail };
  }
  const displayHasApple = submitting ? frozenViewRef.current.hasApple : hasApple;
  const displayAppleEmail = submitting ? frozenViewRef.current.appleEmail : appleEmail;

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(null), shopConfig.noticeMs);
    return () => clearTimeout(timeout);
  }, [success]);

  function linkErrorMessage(code: string): string {
    switch (code) {
      case 'apple_email_mismatch':
        return t.account.errorAppleEmailMismatch;
      case 'apple_already_linked':
        return t.account.errorAppleAlreadyLinked;
      case 'apple_email_required':
        return t.auth.errorAppleEmailRequired;
      case 'email_change_pending':
        return t.account.errorEmailChangePending;
      case 'email_already_used':
        return t.account.errorEmailAlreadyUsed;
      case 'invalid_or_expired_token':
        return t.auth.otpInvalidError;
      case 'invalid_apple_token':
        return t.auth.errorAppleToken;
      case 'apple_sign_in_disabled':
      case 'sign_in_method_forbidden':
        return t.auth.errorAppleDisabled;
      case 'unlock_invalid':
        return t.auth.errorUnlockInvalid;
      case 'rate_limited':
      case 'request_timeout':
        return t.auth.authServiceBusy;
      default:
        return t.auth.errorGeneric;
    }
  }

  async function handleCredential(idToken: string, nonce: string, unlockTokenOverride?: string) {
    const linkToken = unlockTokenOverride ?? appleToken;
    if (!linkToken) return;
    setAppleLinkToken(linkToken);
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) => authApi.linkAppleAccount(token, idToken, linkToken, nonce)),
        shopConfig.loadingMinMs.normal,
      );
      if (authApi.isLinkAppleNeedsEmailChoice(result)) {
        setEmailChoice({
          appleLinkToken: result.appleLinkToken,
          currentEmail: result.currentEmail,
          appleEmail: result.appleEmail,
        });
        return;
      }
      setUser(result.user);
      unlock.consume();
      setAppleLinkToken(null);
      setSuccess('link');
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      const code =
        err instanceof ApiError
          ? err.code
          : isApiRequestTimeoutError(err)
            ? 'request_timeout'
            : 'unknown_error';
      if (code === 'apple_sign_in_disabled' || code === 'sign_in_method_forbidden') {
        setAppleOffered(false);
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
    if (hasApple) return;
    const pending = takeAppleLinkCredential();
    if (!pending) return;
    void handleCredentialRef.current(pending.idToken, pending.nonce, pending.unlockToken);
    // Resume link after the full-page Apple redirect, including its unlock token.
  }, [hasApple]);

  async function handleEmailChoice(choice: 'keep' | 'switch') {
    const linkToken = appleLinkToken ?? appleToken;
    if (!linkToken || !emailChoice) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          authApi.completeAppleLink(token, emailChoice.appleLinkToken, choice, linkToken),
        ),
        shopConfig.loadingMinMs.normal,
      );
      setEmailChoice(null);
      setUser(result.user);
      unlock.consume();
      setAppleLinkToken(null);
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
    if (!appleToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) => authApi.unlinkAppleAccount(token, appleToken!)),
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

  if (!embedded && !displayHasApple && !appleOffered) return null;

  const showLinkAction = !displayHasApple && unlock.unlocked && appleOffered;
  const showUnlinkAction = displayHasApple && unlock.unlocked;
  const unavailable = embedded && !displayHasApple && !appleOffered;
  const rootClassName = embedded ? styles.socialSignInPane : `${styles.block} ${styles.googleBlock}`;

  return (
    <div
      className={rootClassName}
      data-testid={embedded ? 'account-sign-in-methods-apple' : 'account-apple-sign-in'}
    >
      {embedded ? (
        <SocialSignInRow
          iconSrc={appleIconUrl}
          name={t.account.appleEmailSecondaryLabel}
          hint={
            displayHasApple && displayAppleEmail
              ? displayAppleEmail
              : unavailable
                ? t.account.signInMethodUnavailable
                : t.account.signInMethodApplePaneHint
          }
          status={displayHasApple ? 'linked' : unavailable ? 'unavailable' : undefined}
          statusLabel={
            displayHasApple
              ? t.account.signInMethodAppleLinked
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
                src={appleIconUrl}
                alt=""
                width={28}
                height={28}
                decoding="async"
              />
              <h2 className={styles.blockTitle}>{t.account.signInMethodsAppleTitle}</h2>
              {displayHasApple && (
                <span className={`${styles.badge} ${styles.badgeVerified}`}>
                  {t.account.signInMethodAppleLinked}
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
            {displayHasApple ? t.account.signInMethodAppleLinkedHint : t.account.signInMethodAppleLinkHint}
          </p>
        )}
        {error && (
          <p className={authFormStyles.fieldError} role="alert">
            {error}
          </p>
        )}
        {success === 'link' && (
          <p className={authFormStyles.success} role="status">
            {t.account.signInMethodAppleLinkSuccess}
          </p>
        )}
        {success === 'unlink' && (
          <p className={authFormStyles.success} role="status">
            {t.account.signInMethodAppleUnlinkSuccess}
          </p>
        )}
        {showLinkAction && (
          <AppleLinkButton
            disabled={submitting || emailChoice != null}
            onCredential={handleCredential}
            onUnavailable={() => setAppleOffered(false)}
          />
        )}
        {showUnlinkAction && (
          <SocialUnlinkButton
            provider="apple"
            disabled={submitting}
            onClick={() => void handleUnlink()}
            testId="account-apple-unlink"
          >
            {t.account.signInMethodAppleUnlinkButton}
          </SocialUnlinkButton>
        )}
      </div>
      {emailChoice && (
        <GoogleEmailChoiceModal
          title={t.account.appleEmailChoiceTitle}
          message={t.account.appleEmailChoiceMessage}
          currentEmail={emailChoice.currentEmail}
          providerEmail={emailChoice.appleEmail}
          keepLabel={t.account.appleEmailChoiceKeep}
          switchLabel={t.account.appleEmailChoiceSwitch}
          closeLabel={t.account.unlockCancelButton}
          busy={submitting}
          testId="account-apple-email-choice"
          onKeep={() => void handleEmailChoice('keep')}
          onSwitch={() => void handleEmailChoice('switch')}
          onCancel={() => setEmailChoice(null)}
        />
      )}
      {submitting && <LoadingModal message={t.auth.loadingLogin} />}
    </div>
  );
}
