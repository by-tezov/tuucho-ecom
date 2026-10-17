import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { HOME_PATH } from '../config/paths';
import { Seo } from '../components/seo/Seo';
import { confirmEmail } from '../api/identity';
import { Button } from '../components/ui/Button';
import authFormStyles from '../components/auth/AuthForm.module.css';
import styles from './AuthPage.module.css';

type ConfirmState = 'loading' | 'verified' | 'emailChanged' | 'alreadyVerified' | 'invalid';

export function ConfirmEmailPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<ConfirmState>(token ? 'loading' : 'invalid');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    confirmEmail(token)
      .then((result) => {
        if (cancelled) return;
        if (result.alreadyVerified) setState('alreadyVerified');
        else if (result.emailChanged) setState('emailChanged');
        else setState('verified');
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const done = state === 'verified' || state === 'emailChanged' || state === 'alreadyVerified';
  const message =
    state === 'verified'
      ? t.auth.confirmEmailSuccess
      : state === 'emailChanged'
        ? t.auth.confirmEmailChangedSuccess
        : state === 'alreadyVerified'
          ? t.auth.confirmEmailAlreadyVerified
          : state === 'invalid'
            ? t.auth.confirmEmailInvalidToken
            : t.auth.confirmEmailChecking;

  const noteClass =
    state === 'invalid'
      ? authFormStyles.noteError
      : state === 'alreadyVerified'
        ? authFormStyles.noteWarning
        : state === 'loading'
          ? undefined
          : authFormStyles.noteSuccess;

  return (
    <section
      aria-labelledby="confirm-email-h"
      className={
        done
          ? `${styles.section} ${styles.confirmSection} ${styles.registerDone}`
          : `${styles.section} ${styles.confirmSection}`
      }
    >
      <Seo
        title={t.auth.confirmEmailTitle}
        description={t.auth.confirmEmailTitle}
        path="/account/confirm-email"
        noindex
      />
      <div className={styles.confirmTitleBlock}>
        <h1 id="confirm-email-h" className={styles.title}>
          {t.auth.confirmEmailTitle}
        </h1>
      </div>
      {message && (
        <div className={styles.registerSuccessBody}>
          <p className={noteClass} data-testid="auth-confirm-email-status">
            {message}
          </p>
          {done && <p>{t.auth.confirmEmailThanks}</p>}
        </div>
      )}
      {done ? (
        <div className={styles.registerDoneActions}>
          <Button type="button" onClick={() => navigate(HOME_PATH, { replace: true })}>
            {t.auth.registerSuccessCta}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
