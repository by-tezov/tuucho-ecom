import { useState } from 'react';
import * as authApi from '../api/account';
import { ApiError } from '../api/errors';
import { type UnlockAction } from '../api/account';
import { isBackendUnavailableError } from '../api/http';

type AuthedRequest = <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;

export interface SectionUnlock {
  unlocked: boolean;
  token: string | null;
  confirming: boolean;
  hasPassword: boolean;
  password: string;
  setPassword: (value: string) => void;
  otpCode: string;
  setOtpCode: (value: string) => void;
  otpSent: boolean;
  errorCode: string | null;
  submitting: boolean;
  begin: () => void;
  cancel: () => void;
  submit: () => Promise<void>;
  /** Returns true when the OTP email was accepted by the server. */
  resendOtp: () => Promise<boolean>;
  /** Call right after the owning form's own save succeeds — the server has
   * already invalidated the token (single-use), this just re-locks the UI
   * to match so a second edit requires unlocking again. */
  consume: () => void;
}

/** One instance per account-settings section (profile/email/password) —
 * see AccountPage.tsx. Each section unlocks independently: obtaining a
 * token for one action never unlocks another. Passwordless accounts
 * (`hasPassword === false`) send/verify an email OTP instead of the
 * current password. */
export function useSectionUnlock(
  action: UnlockAction,
  authedRequest: AuthedRequest,
  hasPassword = true,
): SectionUnlock {
  const [token, setToken] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendOtp(): Promise<boolean> {
    setSubmitting(true);
    setErrorCode(null);
    try {
      await authedRequest((accessToken) => authApi.requestUnlockOtp(accessToken, action));
      setOtpSent(true);
      return true;
    } catch (err) {
      if (isBackendUnavailableError(err)) return false;
      setErrorCode(err instanceof ApiError ? err.code : 'unknown_error');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function begin() {
    setConfirming(true);
    setErrorCode(null);
    setOtpCode('');
    setOtpSent(false);
    if (!hasPassword) void sendOtp();
  }

  function cancel() {
    setConfirming(false);
    setPassword('');
    setOtpCode('');
    setOtpSent(false);
    setErrorCode(null);
  }

  async function submit() {
    setSubmitting(true);
    setErrorCode(null);
    try {
      const result = hasPassword
        ? await authedRequest((accessToken) => authApi.unlockAccountSection(accessToken, action, password))
        : await authedRequest((accessToken) =>
            authApi.unlockAccountSectionWithOtp(accessToken, action, otpCode),
          );
      setToken(result.unlockToken);
      setConfirming(false);
      setPassword('');
      setOtpCode('');
      setOtpSent(false);
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      setErrorCode(err instanceof ApiError ? err.code : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  function consume() {
    setToken(null);
  }

  return {
    unlocked: token !== null,
    token,
    confirming,
    hasPassword,
    password,
    setPassword,
    otpCode,
    setOtpCode,
    otpSent,
    errorCode,
    submitting,
    begin,
    cancel,
    submit,
    resendOtp: sendOtp,
    consume,
  };
}
