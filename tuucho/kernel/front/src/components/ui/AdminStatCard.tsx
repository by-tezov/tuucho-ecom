import type { ReactNode } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './AdminStatCard.module.css';

export type AdminStatMetric = {
  label: string;
  value: ReactNode;
};

interface AdminStatCardProps {
  title: string;
  metrics?: AdminStatMetric[] | undefined;
  children?: ReactNode | undefined;
}

/** KPI card on Admin home. Themes may replace it. Extra tables go in children. */
function AdminStatCardRoot({ title, metrics, children }: AdminStatCardProps) {
  return (
    <article className={styles.card}>
      <h3>{title}</h3>
      {metrics?.length ? (
        <dl className={styles.metrics}>
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </article>
  );
}

export const AdminStatCard = withKernelUi(KERNEL_UI.AdminStatCard, AdminStatCardRoot);
