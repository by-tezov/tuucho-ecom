import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import { Seo } from '../components/seo/Seo';
import { ApiError } from '../api/errors';
import { useAuthCommands, useAuthPrompt, useAuthSession } from '../state/AuthContext';
import { Button } from '../components/ui/Button';
import { LoadingModal } from '../components/ui/LoadingModal';
import authFormStyles from '../components/auth/AuthForm.module.css';
import styles from './AuthPage.module.css';

type ManageState = 'loading' | 'done' | 'locked' | 'invalid';

export function ManageOrderPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { status } = useAuthSession();
  const { completeManageGuestOrder } = useAuthCommands();
  const { promptAuth, hasPendingGuestMerge } = useAuthPrompt();
  const [state, setState] = useState<ManageState>(token ? 'loading' : 'invalid');
  const startedRef = useRef(false);
  const completeManageGuestOrderRef = useRef(completeManageGuestOrder);
  completeManageGuestOrderRef.current = completeManageGuestOrder;

  useEffect(() => {
    if (!token) return;
    // Wait for remember-me silent refresh to finish first. Consuming the
    // token in parallel lets that refresh's Set-Cookie and in-memory
    // session land after the guest account and keep the previous user.
    // completeManageGuestOrder then logs out any restored account so a
    // different signed-in user cannot block the token.
    if (status === 'loading') return;
    if (startedRef.current) return;
    startedRef.current = true;
    completeManageGuestOrderRef
      .current(token)
      .then((result) => {
        if (result.alreadyManaged) {
          setState('invalid');
          return;
        }
        setState('done');
      })
      .catch((error) => {
        if (error instanceof ApiError && error.code === 'account_security_locked') {
          setState('locked');
          return;
        }
        setState('invalid');
      });
  }, [status, token]);

  useEffect(() => {
    if (state !== 'done' || status !== 'authenticated' || hasPendingGuestMerge) return;
    navigate(localizedPath('/orders', lang), { replace: true });
  }, [hasPendingGuestMerge, lang, navigate, state, status]);

  const failed = state === 'invalid' || state === 'locked';
  const message =
    state === 'locked'
      ? t.auth.manageOrderLocked
      : state === 'invalid'
        ? t.auth.manageOrderInvalidToken
        : t.auth.manageOrderSubmitting;

  return (
    <section aria-labelledby="manage-order-h" className={styles.section}>
      <Seo
        title={t.auth.manageOrderTitle}
        description={t.auth.manageOrderTitle}
        path="/account/manage-order"
        noindex
      />
      {(state === 'loading' || state === 'done') && !hasPendingGuestMerge ? (
        <LoadingModal message={t.auth.manageOrderSubmitting} />
      ) : null}
      {failed ? (
        <>
          <div className={styles.confirmTitleBlock}>
            <h1 id="manage-order-h" className={styles.title}>
              {t.auth.manageOrderTitle}
            </h1>
          </div>
          <div className={styles.registerSuccessBody}>
            <p className={authFormStyles.noteError} data-testid="auth-manage-order-status">
              {message}
            </p>
          </div>
          <div className={styles.registerDoneActions}>
            <Button type="button" onClick={() => promptAuth('login')}>
              {t.auth.manageOrderLoginCta}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
