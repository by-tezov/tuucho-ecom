import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { confirmPasswordReset } from '../api/identity';
import { ApiError } from '../api/errors';
import { isBackendUnavailableError } from '../api/http';
import { PasswordField } from '../components/auth/PasswordField';
import { FIELD_PASSWORD_MAX } from '../utils/fieldLimits';
import authFormStyles from '../components/auth/AuthForm.module.css';
import styles from './AuthPage.module.css';

export function ResetPasswordPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function errorMessage(code: string): string {
    switch (code) {
      case 'invalid_or_expired_token':
        return t.auth.resetPasswordInvalidToken;
      case 'weak_password':
        return t.auth.errorWeakPassword;
      default:
        return t.auth.errorGeneric;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError(t.auth.errorWeakPassword);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.auth.passwordMismatchError);
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setDone(true);
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      setError(errorMessage(err instanceof ApiError ? err.code : 'unknown_error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="reset-h" className={styles.section}>
      <Seo
        title={t.auth.resetPasswordTitle}
        description={t.auth.resetPasswordTitle}
        path="/account/reset-password"
        noindex
      />
      <h1 id="reset-h" className={styles.title}>
        {t.auth.resetPasswordTitle}
      </h1>

      {!token ? (
        <p className={authFormStyles.error}>{t.auth.resetPasswordInvalidToken}</p>
      ) : done ? (
        <div>
          <p className={authFormStyles.success}>{t.auth.resetPasswordSuccess}</p>
          <Button
            type="button"
            onClick={() => navigate(localizedPath('/login', lang))}
            style={{ marginTop: 16 }}
          >
            {t.auth.resetPasswordBackToLogin}
          </Button>
        </div>
      ) : (
        <form className={authFormStyles.form} onSubmit={handleSubmit} noValidate>
          {error && (
            <p id="reset-password-error" className={authFormStyles.error} role="alert">
              {error}
            </p>
          )}
          <div className={authFormStyles.field}>
            <label className={authFormStyles.label} htmlFor="reset-password-new">
              {t.auth.passwordLabel}
            </label>
            <PasswordField
              id="reset-password-new"
              autoComplete="new-password"
              maxLength={FIELD_PASSWORD_MAX}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={error != null}
              aria-describedby={
                error ? 'reset-password-error reset-password-new-hint' : 'reset-password-new-hint'
              }
            />
            <span id="reset-password-new-hint" className={authFormStyles.hint}>
              {t.auth.passwordComplexityHint}
            </span>
          </div>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>{t.auth.confirmPasswordLabel}</span>
            <PasswordField
              autoComplete="new-password"
              maxLength={FIELD_PASSWORD_MAX}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={error != null}
              aria-describedby={error ? 'reset-password-error' : undefined}
            />
          </label>
          <Button type="submit" disabled={submitting}>
            {t.auth.resetPasswordSubmit}
          </Button>
        </form>
      )}
    </section>
  );
}
