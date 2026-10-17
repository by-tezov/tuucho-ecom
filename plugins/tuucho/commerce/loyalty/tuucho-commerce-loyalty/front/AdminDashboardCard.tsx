import { useLang } from '@kernel/front/assets/i18n';
import { formatPrice } from '@kernel/front/utils/formatPrice';
import { useAdminDashboardStats } from '@kernel/front/routes/AdminDashboardContext';
import styles from '@kernel/front/routes/AdminPage.module.css';

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return formatPrice(value);
}

export function AdminDashboardCard() {
  const { t } = useLang();
  const stats = useAdminDashboardStats();
  if (!stats?.loyalty) return null;
  return (
    <article className={styles.statCard}>
      <h3>{t.admin.loyaltyStatsCardTitle}</h3>
      <dl className={styles.metrics}>
        <div>
          <dt>{t.admin.loyaltyTotalOutstanding}</dt>
          <dd>{money(stats.loyalty.totalOutstanding)}</dd>
        </div>
        <div>
          <dt>{t.admin.loyaltyPendingGrant}</dt>
          <dd>{money(stats.loyalty.pendingGrant)}</dd>
        </div>
        <div>
          <dt>{t.admin.loyaltyAtRisk}</dt>
          <dd>{money(stats.loyalty.atRiskBeforeNextMarch)}</dd>
        </div>
        <div>
          <dt>{t.admin.loyaltyUsersWithBalance}</dt>
          <dd>{stats.loyalty.usersWithBalance ?? '-'}</dd>
        </div>
        <div>
          <dt>{t.admin.loyaltyMinAvailable}</dt>
          <dd>{money(stats.loyalty.minAvailable)}</dd>
        </div>
        <div>
          <dt>{t.admin.loyaltyAvgAvailable}</dt>
          <dd>{money(stats.loyalty.averageAvailable)}</dd>
        </div>
        <div>
          <dt>{t.admin.loyaltyMaxAvailable}</dt>
          <dd>{money(stats.loyalty.maxAvailable)}</dd>
        </div>
      </dl>
    </article>
  );
}
