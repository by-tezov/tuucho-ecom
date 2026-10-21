import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './SocialSignInRow.module.css';

export type SocialSignInRowStatus = 'linked' | 'unavailable';

interface SocialSignInRowProps {
  iconSrc: string;
  name: string;
  hint: string;
  status?: SocialSignInRowStatus | undefined;
  statusLabel?: string | undefined;
  className?: string | undefined;
}

/** Icon + name + hint row for account social providers. Themes may replace it. */
function SocialSignInRowRoot({
  iconSrc,
  name,
  hint,
  status,
  statusLabel,
  className,
}: SocialSignInRowProps) {
  const names = [styles.root, className].filter(Boolean).join(' ');
  const statusClass =
    status === 'linked'
      ? `${styles.status} ${styles.statusLinked}`
      : status === 'unavailable'
        ? `${styles.status} ${styles.statusUnavailable}`
        : '';
  return (
    <div className={names} aria-disabled={status === 'unavailable' ? true : undefined}>
      <img className={styles.icon} src={iconSrc} alt="" width={28} height={28} decoding="async" />
      <div className={styles.title}>
        <span className={styles.name}>{name}</span>
        <span className={styles.hint}>{hint}</span>
      </div>
      {status && statusLabel ? <span className={statusClass}>{statusLabel}</span> : null}
    </div>
  );
}

export const SocialSignInRow = withKernelUi(KERNEL_UI.SocialSignInRow, SocialSignInRowRoot);
