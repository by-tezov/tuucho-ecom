import { patchAdminPreferences, type AdminPreferences } from '../api/admin/commerce';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import styles from './AdminPreferencesPage.module.css';
import { useAdminStrings } from '../assets/i18n/admin';

function ToggleRow({
  title,
  script,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  script?: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleText}>
        <strong>{title}</strong>
        {script ? <code className={styles.script}>{script}</code> : null}
        <span className={styles.hint}>{hint}</span>
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={script ? `${title} (${script})` : title}
      />
    </div>
  );
}

/** Split out of AdminPreferencesPage.tsx (size ratchet). */
export function AdminPreferencesCronLogToggles(props: {
  preferences: AdminPreferences;
  busy: boolean;
  save: (patch: Parameters<typeof patchAdminPreferences>[1], label: string) => Promise<void>;
}) {
  const { preferences, busy, save } = props;
  const a = useAdminStrings();
  return (
    <section className={styles.panel} aria-labelledby="prefs-runtime">
      <h2 id="prefs-runtime" className={styles.panelTitle}>
        {a.prefs.runtimeTitle}
      </h2>
      <p className={styles.panelHint}>{a.prefs.runtimeHint}</p>
      <ToggleRow
        title={a.prefs.cronShipmentLog}
        script="main-cron-shipment-tracking.sh"
        hint={a.prefs.cronShipmentLogHint}
        checked={preferences.cronShipmentLogEnabled}
        disabled={busy}
        onChange={(checked) => void save({ cronShipmentLogEnabled: checked }, 'cronLog')}
      />
      <ToggleRow
        title={a.prefs.cronDeletionLog}
        script="main-cron-account-deletion.sh"
        hint={a.prefs.cronDeletionLogHint}
        checked={preferences.cronAccountDeletionLogEnabled}
        disabled={busy}
        onChange={(checked) => void save({ cronAccountDeletionLogEnabled: checked }, 'cronDeletionLog')}
      />
      <ToggleRow
        title={a.prefs.cronGuestLog}
        script="main-cron-guest-saved-cleanup.sh"
        hint={a.prefs.cronGuestLogHint}
        checked={preferences.cronGuestSavedCleanupLogEnabled}
        disabled={busy}
        onChange={(checked) => void save({ cronGuestSavedCleanupLogEnabled: checked }, 'cronGuestSavedLog')}
      />
      <ToggleRow
        title={a.prefs.cronLoyaltyLog}
        script="main-cron-loyalty.sh"
        hint={a.prefs.cronLoyaltyLogHint}
        checked={preferences.cronLoyaltyLogEnabled}
        disabled={busy}
        onChange={(checked) => void save({ cronLoyaltyLogEnabled: checked }, 'cronLoyaltyLog')}
      />
      <ToggleRow
        title={a.prefs.cronGiftLog}
        script="main-cron-gift.sh"
        hint={a.prefs.cronGiftLogHint}
        checked={preferences.cronGiftLogEnabled}
        disabled={busy}
        onChange={(checked) => void save({ cronGiftLogEnabled: checked }, 'cronGiftLog')}
      />
      <ToggleRow
        title={a.prefs.cronGiftPurgeLog}
        script="main-cron-gift-purge.sh"
        hint={a.prefs.cronGiftPurgeLogHint}
        checked={preferences.cronGiftPurgeLogEnabled}
        disabled={busy}
        onChange={(checked) => void save({ cronGiftPurgeLogEnabled: checked }, 'cronGiftPurgeLog')}
      />
      <ToggleRow
        title={a.prefs.cronAuthLog}
        script="main-cron-payment-auth-expiry.sh"
        hint={a.prefs.cronAuthLogHint}
        checked={preferences.cronPaymentAuthExpirySpyLogEnabled}
        disabled={busy}
        onChange={(c) => void save({ cronPaymentAuthExpirySpyLogEnabled: c }, 'cronAuthExpiryLog')}
      />
      <ToggleRow
        title={a.prefs.cronWarmLog}
        script="main-cron-warm.sh"
        hint={a.prefs.cronWarmLogHint}
        checked={preferences.cronWarmLogEnabled}
        disabled={busy}
        onChange={(c) => void save({ cronWarmLogEnabled: c }, 'cronWarmLog')}
      />
      <ToggleRow
        title={a.prefs.apiLog}
        hint={
          preferences.apiLogEnabled && !preferences.apiLogEnabledEffective
            ? a.prefs.apiLogForcedOff
            : a.prefs.apiLogHint
        }
        checked={preferences.apiLogEnabled}
        disabled={busy}
        onChange={(checked) => void save({ apiLogEnabled: checked }, 'apiLog')}
      />
      <ToggleRow
        title={a.prefs.emailLog}
        hint={a.prefs.emailLogHint}
        checked={preferences.emailLogEnabled}
        disabled={busy}
        onChange={(checked) => void save({ emailLogEnabled: checked }, 'emailLog')}
      />
    </section>
  );
}
