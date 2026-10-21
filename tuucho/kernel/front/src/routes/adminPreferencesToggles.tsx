import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import styles from './AdminPreferencesPage.module.css';

export function ToggleRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleText}>
        <strong>{title}</strong>
        <span className={styles.hint}>{hint}</span>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} aria-label={title} />
    </div>
  );
}
