import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { Seo } from '../components/seo/Seo';
import { lockAccount } from '../api/identity';
import { Button } from '../components/ui/Button';
import authFormStyles from '../components/auth/AuthForm.module.css';
import styles from './AuthPage.module.css';

type LockState = 'idle' | 'submitting' | 'locked' | 'invalid';

/** Landing page for the "this wasn't me" link sent to the OLD email address
 * on a change-email request (see account.routes.ts). Deliberately requires
 * an explicit click rather than auto-triggering on load like
 * ConfirmEmailPage — locking the account is a much bigger, harder-to-reverse
 * action (no self-service unlock) than confirming an email, so a link
 * scanner/prefetcher accidentally visiting this page must never trigger it. */
export function SecurityLockPage() {
  const { t } = useLang();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<LockState>(token ? 'idle' : 'invalid');

  async function handleConfirm() {
    setState('submitting');
    try {
      await lockAccount(token);
      setState('locked');
    } catch {
      setState('invalid');
    }
  }

  return (
    <section aria-labelledby="security-lock-h" className={styles.section}>
      <Seo
        title={t.auth.securityLockTitle}
        description={t.auth.securityLockTitle}
        path="/account/security-lock"
        noindex
      />
      <h1 id="security-lock-h" className={styles.title}>
        {t.auth.securityLockTitle}
      </h1>
      {(state === 'idle' || state === 'submitting') && (
        <>
          <p className={authFormStyles.field}>{t.auth.securityLockExplanation}</p>
          <Button type="button" onClick={handleConfirm} disabled={state === 'submitting'}>
            {t.auth.securityLockConfirmButton}
          </Button>
        </>
      )}
      {state === 'locked' && <p className={authFormStyles.success}>{t.auth.securityLockSuccess}</p>}
      {state === 'invalid' && <p className={authFormStyles.error}>{t.auth.securityLockInvalidToken}</p>}
    </section>
  );
}
