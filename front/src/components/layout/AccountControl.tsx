import { useLang } from '../../assets/i18n';
import { LoadingModal } from '../ui/LoadingModal';
import { AccountIcon } from './AccountIcon';
import { useAccountEntry } from '../../hooks/useAccountEntry';
import styles from './AccountControl.module.css';

interface AccountControlProps {
  className?: string;
}

/** Account access stays a single header control. While auth is bootstrapping
 * it shows a profile icon; once status is known it switches to the usual
 * Mon compte / Se connecter label. A click during loading only routes after
 * status settles. Subnavigation lives on account pages. */
export function AccountControl({ className }: AccountControlProps) {
  const { t } = useLang();
  const { status, awaitingAuth, openAccountEntry } = useAccountEntry();

  if (status === 'loading') {
    return (
      <>
        <button
          type="button"
          className={[styles.iconTrigger, className].filter(Boolean).join(' ')}
          onClick={openAccountEntry}
          aria-label={t.nav.accountIconAria}
        >
          <AccountIcon />
        </button>
        {awaitingAuth && <LoadingModal message={t.nav.loadingAccount} />}
      </>
    );
  }

  const label = status === 'authenticated' ? t.nav.myAccount : t.auth.submitLogin;

  return (
    <>
      <button
        type="button"
        className={[styles.trigger, status !== 'authenticated' && styles.triggerLogin, className]
          .filter(Boolean)
          .join(' ')}
        data-nav-fit=""
        data-nav-account=""
        onClick={openAccountEntry}
      >
        {label}
      </button>
      {awaitingAuth && <LoadingModal message={t.nav.loadingAccount} />}
    </>
  );
}
