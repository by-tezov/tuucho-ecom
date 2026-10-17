import type { Strings } from '../../assets/i18n/types';

/** Password sign-in / sign-up / OTP failure message, shared by LoginForm and
 * GuestCheckoutPrompt. `reason` qualifies `password_cancelled`. */
export function passwordAuthErrorMessage({ auth }: Strings, code: string, reason?: string): string {
  const messages: Record<string, string> = {
    invalid_credentials: auth.errorInvalidCredentials,
    password_cancelled:
      reason === 'email_verification'
        ? auth.errorPasswordCancelledVerification
        : auth.errorPasswordCancelledSocial,
    account_locked: auth.errorAccountLocked,
    account_security_locked: auth.errorAccountSecurityLocked,
    weak_password: auth.errorWeakPassword,
    invalid_or_expired_token: auth.otpInvalidError,
    resend_limit_exceeded: auth.resendConfirmationLimitReached,
    rate_limited: auth.authServiceBusy,
    request_timeout: auth.authServiceBusy,
    invalid_request: auth.errorInvalidRequest,
  };
  return messages[code] ?? auth.errorGeneric;
}
