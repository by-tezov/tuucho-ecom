import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import type { Strings } from '../../../assets/i18n/types';
import type { AuthUser } from '../../../api/identity';
import * as authApi from '../../../api/account';
import { ApiError } from '../../../api/errors';
import { isBackendUnavailableError } from '../../../api/http';
import {
  FIELD_EMAIL_MAX,
  FIELD_FIRST_NAME_MAX,
  FIELD_LAST_NAME_MAX,
  FIELD_PHONE_MAX,
} from '../../../utils/fieldLimits';
import { isValidPhoneNumberForAnyCountry, toPhoneCountries } from '../../../utils/phone';
import { Button } from '../../ui/Button';
import { RequiredFieldsNote, RequiredMark } from '../../ui/RequiredMark';
import { SectionUnlockButton, SectionUnlockPrompt } from '../SectionUnlockControl';
import { useSectionUnlock } from '../../../hooks/useSectionUnlock';
import { usePhoneInputLabels } from '../../../hooks/usePhoneInputLabels';
import authFormStyles from '../../auth/AuthForm.module.css';
import styles from './AccountSettings.module.css';
import type { AuthedRequest } from './accountSettingsTypes';
import { shopConfig } from '../../../config/env';

export function ResendConfirmation({ t, authedRequest }: { t: Strings; authedRequest: AuthedRequest }) {
  const [status, setStatus] = useState<'idle' | 'sent' | 'limited'>('idle');
  return (
    <p className={styles.resendPrompt}>
      {t.account.resendConfirmationPrompt}{' '}
      <button
        type="button"
        onClick={async () => {
          try {
            await authedRequest((token) => authApi.resendEmailConfirmation(token));
            setStatus('sent');
          } catch (err) {
            if (isBackendUnavailableError(err)) return;
            setStatus(err instanceof ApiError && err.code === 'resend_limit_exceeded' ? 'limited' : 'idle');
          }
        }}
      >
        {t.auth.resendConfirmationButton}
      </button>
      {status !== 'idle' && (
        <span className={styles.resendResult} role="status">
          {status === 'sent' ? t.auth.resendConfirmationSuccess : t.auth.resendConfirmationLimitReached}
        </span>
      )}
    </p>
  );
}

export interface AccountUserSectionProps {
  t: Strings;
  user: AuthUser;
  setUser: (user: AuthUser) => void;
  authedRequest: AuthedRequest;
}

export function ProfileSettings({
  t,
  user,
  setUser,
  authedRequest,
  phoneCountryCodes,
}: AccountUserSectionProps & { phoneCountryCodes: string[] }) {
  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>(
    {},
  );
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // The profile phone number is carried into orders as the recipient
  // number, and the carrier rejects one that isn't valid for the delivery
  // country — so what this field offers is the union of countries any
  // shop-enabled courier serves (`GET /account/phone-countries`), never a
  // list fixed in code. Do not mount PhoneInput until that list is known:
  // `countries={[]}` is treated as “every country” by the library.
  const phoneCountries = useMemo(() => toPhoneCountries(phoneCountryCodes), [phoneCountryCodes]);
  const unlock = useSectionUnlock('profile', authedRequest, user.hasPassword !== false);
  const phoneLabels = usePhoneInputLabels();
  const phoneInputId = useId();
  // Every account starts with all three empty (never set at registration) —
  // filling them in for the first time isn't overwriting anything
  // sensitive, so it's exempt from the step-up unlock (enforced server-side
  // too, against the stored row, not this client state).
  const bypass = !user.firstName && !user.lastName && !user.phone;
  const locked = !bypass && !unlock.unlocked;

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(false), shopConfig.noticeMs);
    return () => clearTimeout(timeout);
  }, [success]);

  function clearFieldError(field: 'firstName' | 'lastName' | 'phone') {
    setFieldErrors((current) => {
      if (current[field] == null) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validate(): boolean {
    const next: { firstName?: string; lastName?: string; phone?: string } = {};
    if (!firstName.trim()) next.firstName = t.account.firstNameRequiredError;
    if (!lastName.trim()) next.lastName = t.account.lastNameRequiredError;
    if (!phone.trim()) next.phone = t.account.phoneRequiredError;
    else if (!isValidPhoneNumberForAnyCountry(phone, phoneCountryCodes)) {
      next.phone = t.account.phoneInvalidError;
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(false);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await authedRequest((token) =>
        authApi.updateProfile(token, { firstName, lastName, phone }, bypass ? undefined : unlock.token!),
      );
      setUser(result.user);
      setSuccess(true);
      if (!bypass) unlock.consume();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`${styles.block} ${styles.profileBlock}`}>
      <div className={styles.blockHeader}>
        <h2 className={styles.blockTitle}>{t.account.profileDetailsTitle}</h2>
        {!bypass && <SectionUnlockButton unlock={unlock} />}
      </div>
      {!bypass && unlock.confirming && <SectionUnlockPrompt unlock={unlock} />}
      <form
        className={`${authFormStyles.form} ${styles.profileForm}`}
        data-testid="account-profile-form"
        onSubmit={handleSubmit}
        noValidate
      >
        {success && (
          <p className={authFormStyles.success} role="status">
            {t.account.saveSuccess}
          </p>
        )}
        <RequiredFieldsNote />
        <fieldset className={styles.fieldsetReset} disabled={locked}>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>
              {t.account.firstNameLabel}
              <RequiredMark />
            </span>
            <input
              name="given-name"
              autoComplete="given-name"
              maxLength={FIELD_FIRST_NAME_MAX}
              className={authFormStyles.input}
              data-testid="account-first-name"
              value={firstName}
              aria-required="true"
              aria-invalid={fieldErrors.firstName != null}
              aria-describedby={fieldErrors.firstName ? 'profile-firstName-error' : undefined}
              onChange={(e) => {
                setFirstName(e.target.value);
                clearFieldError('firstName');
              }}
            />
            {fieldErrors.firstName && (
              <p id="profile-firstName-error" className={authFormStyles.fieldError} role="alert">
                {fieldErrors.firstName}
              </p>
            )}
          </label>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>
              {t.account.lastNameLabel}
              <RequiredMark />
            </span>
            <input
              name="family-name"
              autoComplete="family-name"
              maxLength={FIELD_LAST_NAME_MAX}
              className={authFormStyles.input}
              data-testid="account-last-name"
              value={lastName}
              aria-required="true"
              aria-invalid={fieldErrors.lastName != null}
              aria-describedby={fieldErrors.lastName ? 'profile-lastName-error' : undefined}
              onChange={(e) => {
                setLastName(e.target.value);
                clearFieldError('lastName');
              }}
            />
            {fieldErrors.lastName && (
              <p id="profile-lastName-error" className={authFormStyles.fieldError} role="alert">
                {fieldErrors.lastName}
              </p>
            )}
          </label>
          {/* Label by id, not by wrapping: a wrapping <label> names PhoneInput's
              first control (the country select), never the number (RGAA 11.1). */}
          <div className={authFormStyles.field}>
            <label className={authFormStyles.label} htmlFor={phoneInputId}>
              {t.account.phoneLabel}
              <RequiredMark />
            </label>
            {phoneCountries.length > 0 ? (
              <PhoneInput
                id={phoneInputId}
                name="tel"
                autoComplete="tel"
                maxLength={FIELD_PHONE_MAX}
                {...(authFormStyles.phoneInput ? { className: authFormStyles.phoneInput } : {})}
                data-testid="account-phone"
                value={phone}
                labels={phoneLabels}
                countries={phoneCountries}
                addInternationalOption={false}
                defaultCountry={phoneCountries[0]!}
                international={false}
                disabled={locked}
                aria-required="true"
                aria-invalid={fieldErrors.phone != null}
                aria-describedby={fieldErrors.phone ? 'profile-phone-error' : undefined}
                onChange={(value) => {
                  setPhone(value ?? '');
                  clearFieldError('phone');
                }}
              />
            ) : (
              <input
                id={phoneInputId}
                type="tel"
                name="tel"
                autoComplete="tel"
                maxLength={FIELD_PHONE_MAX}
                className={authFormStyles.input}
                data-testid="account-phone"
                value={phone}
                disabled
                aria-required="true"
                aria-invalid={fieldErrors.phone != null}
                aria-describedby={fieldErrors.phone ? 'profile-phone-error' : undefined}
                readOnly
              />
            )}
            {fieldErrors.phone && (
              <p id="profile-phone-error" className={authFormStyles.fieldError} role="alert">
                {fieldErrors.phone}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant={bypass ? 'primary' : 'ghost'}
            className={styles.profileSubmit}
            disabled={submitting}
            data-testid="account-save-profile"
          >
            {bypass ? t.account.saveButton : t.account.updateButton}
          </Button>
        </fieldset>
      </form>
    </div>
  );
}

export function ChangeEmailSettings({ t, user, setUser, authedRequest }: AccountUserSectionProps) {
  const [newEmail, setNewEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const unlock = useSectionUnlock('email', authedRequest, user.hasPassword !== false);

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(false), shopConfig.noticeMs);
    return () => clearTimeout(timeout);
  }, [success]);

  function errorMessage(code: string): string {
    switch (code) {
      case 'invalid_credentials':
        return t.auth.errorInvalidCredentials;
      case 'email_already_used':
        return t.auth.errorEmailAlreadyUsed;
      case 'unlock_invalid':
        return t.auth.errorUnlockInvalid;
      case 'invalid_request':
        return t.account.newEmailInvalidError;
      default:
        return t.auth.errorGeneric;
    }
  }

  function validate(): boolean {
    const trimmed = newEmail.trim();
    if (!trimmed) {
      setFieldError(t.account.newEmailRequiredError);
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldError(t.account.newEmailInvalidError);
      return false;
    }
    setFieldError(null);
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await authedRequest((token) =>
        authApi.changeEmail(token, newEmail.trim(), unlock.token!),
      );
      setUser({ ...user, pendingEmail: result.pendingEmail });
      setSuccess(true);
      setNewEmail('');
      unlock.consume();
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      setError(errorMessage(err instanceof ApiError ? err.code : 'unknown_error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <h2 className={styles.blockTitle}>{t.account.changeEmailTitle}</h2>
        <SectionUnlockButton unlock={unlock} />
      </div>
      {unlock.confirming && <SectionUnlockPrompt unlock={unlock} />}
      {success && (
        <p className={authFormStyles.success} role="status">
          {t.account.changeEmailPendingNotice}
        </p>
      )}
      <form className={`${authFormStyles.form} ${styles.emailForm}`} onSubmit={handleSubmit} noValidate>
        {error && (
          <p className={authFormStyles.error} role="alert">
            {error}
          </p>
        )}
        <RequiredFieldsNote />
        <fieldset className={styles.fieldsetReset} disabled={!unlock.unlocked}>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>
              {t.account.newEmailLabel}
              <RequiredMark />
            </span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              maxLength={FIELD_EMAIL_MAX}
              className={authFormStyles.input}
              value={newEmail}
              aria-required="true"
              aria-invalid={fieldError != null}
              aria-describedby={fieldError ? 'change-email-error' : undefined}
              onChange={(e) => {
                setNewEmail(e.target.value);
                if (fieldError) setFieldError(null);
              }}
            />
            {fieldError && (
              <p id="change-email-error" className={authFormStyles.fieldError} role="alert">
                {fieldError}
              </p>
            )}
          </label>
          <Button type="submit" variant="ghost" className={styles.emailSubmit} disabled={submitting}>
            {t.account.changeEmailSubmit}
          </Button>
        </fieldset>
      </form>
    </div>
  );
}
