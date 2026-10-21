import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './AdminAttentionCard.module.css';

export type AdminAttentionTone = 'red' | 'orange' | 'purple' | 'blue';

interface AdminAttentionCardProps {
  count: number;
  label: ReactNode;
  to: string;
  tone?: AdminAttentionTone | undefined;
  exception?: boolean | undefined;
}

/** Needs-attention tile on Admin home. Themes may replace it. */
function AdminAttentionCardRoot({
  count,
  label,
  to,
  tone = 'blue',
  exception = false,
}: AdminAttentionCardProps) {
  const names = [styles.card, styles[tone], exception ? styles.exception : null]
    .filter(Boolean)
    .join(' ');
  return (
    <Link to={to} className={names}>
      <span className={styles.count}>{count}</span>
      <span className={styles.label}>{label}</span>
    </Link>
  );
}

export const AdminAttentionCard = withKernelUi(KERNEL_UI.AdminAttentionCard, AdminAttentionCardRoot);
