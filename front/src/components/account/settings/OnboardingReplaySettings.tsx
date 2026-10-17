import { useLang } from '../../../assets/i18n';
import { requestOnboardingReplay } from '../../../state/onboardingGate';
import { Button } from '../../ui/Button';
import styles from './AccountSettings.module.css';

/** Quiet account control to reopen the post-splash shop introduction. */
export function OnboardingReplaySettings() {
  const { t } = useLang();

  return (
    <section className={styles.block} aria-labelledby="onboarding-replay-h">
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
