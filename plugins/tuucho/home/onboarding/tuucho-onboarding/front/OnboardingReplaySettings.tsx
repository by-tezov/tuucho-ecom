import { useLang } from '@kernel/front/assets/i18n';
import { requestOnboardingReplay } from '@kernel/front/state/onboardingGate';
import { Button } from '@kernel/front/components/ui/Button';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import styles from '@kernel/front/components/account/settings/AccountSettings.module.css';

/** Quiet account control to reopen the post-splash shop introduction. */
export function OnboardingReplaySettings() {
  const { t } = useLang();
  const { isImpersonating } = useAuthSession();
  if (isImpersonating) return null;

  return (
    <section className={`${styles.block} ${styles.compactBlock}`} aria-labelledby="onboarding-replay-h">
      <h2 id="onboarding-replay-h" className={styles.blockTitle}>
        {t.account.onboardingReplayTitle}
      </h2>
      <p className={styles.passwordlessHint}>{t.account.onboardingReplayHint}</p>
      <Button
        type="button"
        variant="ghost"
        onClick={() => requestOnboardingReplay()}
        data-testid="account-onboarding-replay"
      >
        {t.account.onboardingReplayButton}
      </Button>
    </section>
  );
}
