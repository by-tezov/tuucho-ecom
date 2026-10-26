import { useState, type FormEvent } from 'react';
import { Seo } from '../components/seo/Seo';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ApiError } from '../api/errors';
import { impersonateUser } from '../api/identity';
import { writeImpersonationHandoff, writeImpersonationHandoffFallback } from '../api/session/giftPinSession';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import styles from './AdminImpersonatePage.module.css';
import { shopConfig } from '../config/env';

export function AdminImpersonatePage() {
  const { t, lang } = useLang();
  const { authedRequest } = useAuthSession();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) return setError(t.admin.invalidEmail);
    const popup = window.open('about:blank', '_blank');
    if (!popup) return setError(t.admin.impersonatePopup);
    setError(null);
    setSubmitting(true);
    try {
      const session = await withMinDuration(
        authedRequest((token) => impersonateUser(token, normalized)),
        shopConfig.loadingMinMs.short,
      );
      writeImpersonationHandoff(popup.sessionStorage, session);
      // The about:blank → /account navigation can drop the popup's
      // sessionStorage; the localStorage one-shot (read + deleted by the new
      // tab's auth bootstrap) covers that loss.
      writeImpersonationHandoffFallback(session);
      popup.location.href = localizedPath('/account', lang);
    } catch (reason) {
      popup.close();
      setError(
        reason instanceof ApiError && reason.code === 'not_found'
          ? t.admin.notFound
          : reason instanceof ApiError && reason.code === 'forbidden'
            ? t.admin.forbidden
            : t.admin.otherError,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="impersonate-h">
      <Seo
        title={t.admin.impersonateTitle}
        description={t.admin.impersonateDescription}
        path={adminPath('/impersonate')}
        noindex
      />
      <h1 id="impersonate-h" className={styles.title}>
        {t.admin.impersonateTitle}
      </h1>
      <article className={styles.card}>
        <p className={styles.description}>{t.admin.impersonateDescription}</p>
        <form onSubmit={(event) => void submit(event)} className={styles.form} noValidate>
          <label className={styles.field} htmlFor="admin-impersonate-email">
            <span>{t.admin.emailLabel}</span>
            <input
              id="admin-impersonate-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError(null);
              }}
              placeholder="client@email.fr"
              autoComplete="off"
              aria-invalid={error != null}
              aria-describedby={error ? 'admin-impersonate-email-error' : undefined}
            />
          </label>
          {error && (
            <p id="admin-impersonate-email-error" className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={styles.submit} disabled={submitting}>
            {t.admin.submit}
          </button>
        </form>
      </article>
      {submitting && <LoadingModal message={t.admin.actionLoading} />}
    </section>
  );
}
