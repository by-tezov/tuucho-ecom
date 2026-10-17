import { useLang } from '../../assets/i18n';
import type { OtpResendCooldown } from '../../hooks/useOtpResendCooldown';
import styles from './OtpResendFooter.module.css';

interface OtpResendFooterProps {
  cooldown: OtpResendCooldown;
  disabled?: boolean;
  onResend: () => void;
}

/** Delivery note + inset separators + resend link with 2-minute cooldown. */
export function OtpResendFooter({ cooldown, disabled = false, onResend }: OtpResendFooterProps) {
  const { t } = useLang();
  const resendDisabled = disabled || cooldown.isCoolingDown;

  return (
    <div className={styles.footer}>
      <div className={styles.divider} aria-hidden="true" />
      <p className={styles.note}>{t.auth.otpDeliveryNote}</p>
      <div className={styles.divider} aria-hidden="true" />
      <div className={styles.resendRow}>
        <button type="button" className={styles.resendLink} disabled={resendDisabled} onClick={onResend}>
          {t.auth.otpResend}
        </button>
        {cooldown.isCoolingDown && (
          <p className={styles.countdown} role="status" aria-live="polite">
            {t.auth.otpResendCountdown(cooldown.remainingMinutes, cooldown.remainingSeconds)}
          </p>
        )}
      </div>
    </div>
  );
}
