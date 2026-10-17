import { useEffect, useState, type FormEvent } from 'react';
import * as authApi from '../../../api/account';
import { ApiError } from '../../../api/errors';
import { isBackendUnavailableError } from '../../../api/http';
import { FIELD_PASSWORD_MAX } from '../../../utils/fieldLimits';
import { useSectionUnlock } from '../../../hooks/useSectionUnlock';
import { Button } from '../../ui/Button';
import { RequiredFieldsNote, RequiredMark } from '../../ui/RequiredMark';
import { PasswordField } from '../../auth/PasswordField';
import { SectionUnlockButton, SectionUnlockPrompt } from '../SectionUnlockControl';
import authFormStyles from '../../auth/AuthForm.module.css';
import styles from './AccountSettings.module.css';
import type { AccountUserSectionProps } from './accountSettingsTypes';
import { shopConfig } from '../../../config/env';

export function PasswordSettings({ t, user, setUser, authedRequest }: AccountUserSectionProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ newPassword?: string; confirmNewPassword?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const hasPassword = user.hasPassword !== false;
  const unlock = useSectionUnlock('password', authedRequest, hasPassword);

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(false), shopConfig.noticeMs);
    return () => clearTimeout(timeout);
  }, [success]);
  const passwordStarted = newPassword.length > 0 || confirmNewPassword.length > 0;
  const passwordStrengthOk =
    newPassword.length >= 8 &&
    newPassword.length <= FIELD_PASSWORD_MAX &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword);
  const passwordRequirements = [
    {
      id: 'minLength',
      label: t.auth.passwordRuleMinLength,
      passed: newPassword.length >= 8 && newPassword.length <= FIELD_PASSWORD_MAX,
    },
    { id: 'uppercase', label: t.auth.passwordRuleUppercase, passed: /[A-Z]/.test(newPassword) },
    { id: 'lowercase', label: t.auth.passwordRuleLowercase, passed: /[a-z]/.test(newPassword) },
    { id: 'digit', label: t.auth.passwordRuleDigit, passed: /[0-9]/.test(newPassword) },
    { id: 'special', label: t.auth.passwordRuleSpecial, passed: /[^A-Za-z0-9]/.test(newPassword) },
    {
      id: 'match',
      label: t.auth.passwordRuleMatch,
      passed: confirmNewPassword.length > 0 && newPassword === confirmNewPassword,
    },
  ].map((requirement) => ({
    ...requirement,
    state: !passwordStarted ? 'neutral' : requirement.passed ? 'passed' : 'pending',
  }));

  function errorMessage(code: string): string {
    switch (code) {
      case 'weak_password':
        return t.auth.errorWeakPassword;
      case 'unlock_invalid':
        return t.auth.errorUnlockInvalid;
      default:
        return t.auth.errorGeneric;
    }
  }

  function clearFieldError(field: 'newPassword' | 'confirmNewPassword') {
    setFieldErrors((current) => {
      if (current[field] == null) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validate(): boolean {
    const next: { newPassword?: string; confirmNewPassword?: string } = {};
    if (!newPassword) {
      next.newPassword = t.account.newPasswordRequiredError;
    } else if (!passwordStrengthOk) {
      next.newPassword = t.auth.errorWeakPassword;
    }
    if (!confirmNewPassword) {
      next.confirmNewPassword = t.account.confirmNewPasswordRequiredError;
    } else if (newPassword && newPassword !== confirmNewPassword) {
      next.confirmNewPassword = t.auth.passwordMismatchError;
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await authedRequest((token) => authApi.changePassword(token, newPassword, unlock.token!));
      setSuccess(true);
      setNewPassword('');
      setConfirmNewPassword('');
      unlock.consume();
      if (!hasPassword) setUser({ ...user, hasPassword: true });
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      setError(errorMessage(err instanceof ApiError ? err.code : 'unknown_error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`${styles.block} ${styles.passwordBlock}`}>
      <div className={styles.blockHeader}>
        <div className={styles.blockTitleRow}>
          <h2 className={styles.blockTitle}>
            {hasPassword ? t.account.changePasswordTitle : t.account.createPasswordTitle}
          </h2>
          <span
            className={
              hasPassword
                ? `${styles.badge} ${styles.badgeVerified}`
                : `${styles.badge} ${styles.badgeUnverified}`
            }
          >
            {hasPassword ? t.account.signInMethodPasswordYes : t.account.signInMethodPasswordNo}
          </span>
        </div>
        <SectionUnlockButton unlock={unlock} />
      </div>
      {!hasPassword && <p className={styles.passwordlessHint}>{t.account.passwordlessHint}</p>}
      {unlock.confirming && <SectionUnlockPrompt unlock={unlock} />}
      <form className={styles.passwordForm} onSubmit={handleSubmit} noValidate>
        <fieldset className={`${styles.passwordMain} ${styles.fieldsetReset}`} disabled={!unlock.unlocked}>
          {error && (
            <p className={authFormStyles.error} role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className={authFormStyles.success} role="status">
              {t.account.changePasswordSuccess}
            </p>
          )}
          <RequiredFieldsNote />
          <div className={authFormStyles.field}>
            <label className={authFormStyles.label} htmlFor="change-password-new">
              {t.account.newPasswordLabel}
              <RequiredMark />
            </label>
            <PasswordField
              id="change-password-new"
              name="new-password"
              autoComplete="new-password"
              maxLength={FIELD_PASSWORD_MAX}
              value={newPassword}
              aria-required="true"
              aria-invalid={fieldErrors.newPassword != null}
              aria-describedby={
                fieldErrors.newPassword
                  ? 'change-password-new-error change-password-requirements'
                  : 'change-password-requirements'
              }
              onChange={(e) => {
                setNewPassword(e.target.value);
                clearFieldError('newPassword');
              }}
            />
            {fieldErrors.newPassword && (
              <p id="change-password-new-error" className={authFormStyles.fieldError} role="alert">
                {fieldErrors.newPassword}
              </p>
            )}
          </div>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>
              {t.account.confirmNewPasswordLabel}
              <RequiredMark />
            </span>
            <PasswordField
              name="new-password-confirm"
              autoComplete="new-password"
              maxLength={FIELD_PASSWORD_MAX}
              value={confirmNewPassword}
              aria-required="true"
              aria-invalid={fieldErrors.confirmNewPassword != null}
              aria-describedby={
                fieldErrors.confirmNewPassword
                  ? 'change-password-confirm-error change-password-requirements'
                  : 'change-password-requirements'
              }
              onChange={(e) => {
                setConfirmNewPassword(e.target.value);
                clearFieldError('confirmNewPassword');
              }}
            />
            {fieldErrors.confirmNewPassword && (
              <p id="change-password-confirm-error" className={authFormStyles.fieldError} role="alert">
                {fieldErrors.confirmNewPassword}
              </p>
            )}
          </label>
          <Button type="submit" variant="ghost" disabled={submitting}>
            {t.account.changePasswordSubmit}
          </Button>
        </fieldset>
        <aside
          className={`${authFormStyles.passwordPanel} ${styles.passwordRules}`}
          aria-label={t.auth.passwordRulesTitle}
        >
          <div className={authFormStyles.passwordPanelSeparator} aria-hidden="true">
            <span className={authFormStyles.passwordPanelSeparatorLabel}>{t.auth.passwordRulesTitle}</span>
          </div>
          <div className={authFormStyles.passwordPanelBody}>
            <ul id="change-password-requirements" className={authFormStyles.passwordStepper}>
              {passwordRequirements.map((requirement) => (
                <li
                  key={requirement.id}
                  data-testid={`account-password-rule-${requirement.id}`}
                  data-state={requirement.state}
                  className={
                    requirement.state === 'passed'
                      ? `${authFormStyles.passwordRequirement} ${authFormStyles.passwordRequirementPassed}`
                      : requirement.state === 'pending'
                        ? `${authFormStyles.passwordRequirement} ${authFormStyles.passwordRequirementPending}`
                        : `${authFormStyles.passwordRequirement} ${authFormStyles.passwordRequirementNeutral}`
                  }
                >
                  <span>{requirement.label}</span>
                  <span className={authFormStyles.passwordRequirementStatus} aria-hidden="true">
                    {requirement.state === 'passed' ? '✓' : requirement.state === 'pending' ? '×' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </form>
    </div>
  );
}
