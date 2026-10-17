import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { ApiError } from '../api/errors';
import { getFacebookDataDeletionStatus } from '../api/identity';
import { Seo } from '../components/seo/Seo';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import authFormStyles from '../components/auth/AuthForm.module.css';
import styles from './AuthPage.module.css';

/** Public status page for Meta’s data-deletion confirmation URL. */
export function FacebookDataDeletionPage() {
  const { t, lang } = useLang();
  const [params] = useSearchParams();
  const code = params.get('code')?.trim() ?? '';
  const [loading, setLoading] = useState(Boolean(code));
  const [error, setError] = useState<string | null>(code ? null : t.auth.facebookDataDeletionNotFound);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getFacebookDataDeletionStatus(code);
        if (cancelled) return;
        setConfirmationCode(result.confirmationCode);
        switch (result.status) {
          case 'account_deletion_scheduled': {
            const date = result.deletionScheduledFor
              ? new Date(result.deletionScheduledFor).toLocaleDateString(lang)
              : '';
            setMessage(t.auth.facebookDataDeletionStatusScheduled(date));
            break;
          }
          case 'facebook_unlinked':
            setMessage(t.auth.facebookDataDeletionStatusUnlinked);
            break;
          case 'no_matching_account':
            setMessage(t.auth.facebookDataDeletionStatusNoAccount);
            break;
          default:
            setMessage(t.auth.facebookDataDeletionStatusUnlinked);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.code === 'not_found'
            ? t.auth.facebookDataDeletionNotFound
            : t.auth.errorGeneric,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang, t.auth]);

  return (
    <section className={styles.section} aria-labelledby="facebook-data-deletion-h">
      <Seo
        title={t.auth.facebookDataDeletionTitle}
        description={t.auth.facebookDataDeletionTitle}
        path="/auth/facebook-data-deletion"
        noindex
      />
      <LegalPageBackLink placement="top" />
      <h1 id="facebook-data-deletion-h" className={styles.title}>
        {t.auth.facebookDataDeletionTitle}
      </h1>
      {loading && <p>{t.auth.facebookDataDeletionLoading}</p>}
      {!loading && error && (
        <p className={authFormStyles.error} role="alert">
          {error}
        </p>
      )}
      {!loading && !error && message && (
        <>
          <p>{message}</p>
          {confirmationCode && (
            <p>
              {t.auth.facebookDataDeletionCodeLabel}: <strong>{confirmationCode}</strong>
            </p>
          )}
        </>
      )}
    </section>
  );
}
