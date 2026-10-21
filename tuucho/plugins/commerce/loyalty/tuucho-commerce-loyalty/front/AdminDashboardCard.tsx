import { useLang } from '@kernel/front/assets/i18n';
import { formatPrice } from '@kernel/front/utils/formatPrice';
import { useAdminDashboardStats } from '@kernel/front/routes/AdminDashboardContext';
import { AdminStatCard } from '@kernel/front/ui';

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return formatPrice(value);
}

export function AdminDashboardCard() {
  const { t } = useLang();
  const stats = useAdminDashboardStats();
  if (!stats?.loyalty) return null;
  return (
    <AdminStatCard
      title={t.admin.loyaltyStatsCardTitle}
      metrics={[
        { label: t.admin.loyaltyTotalOutstanding, value: money(stats.loyalty.totalOutstanding) },
        { label: t.admin.loyaltyPendingGrant, value: money(stats.loyalty.pendingGrant) },
        { label: t.admin.loyaltyAtRisk, value: money(stats.loyalty.atRiskBeforeNextMarch) },
        { label: t.admin.loyaltyUsersWithBalance, value: stats.loyalty.usersWithBalance ?? '-' },
        { label: t.admin.loyaltyMinAvailable, value: money(stats.loyalty.minAvailable) },
        { label: t.admin.loyaltyAvgAvailable, value: money(stats.loyalty.averageAvailable) },
        { label: t.admin.loyaltyMaxAvailable, value: money(stats.loyalty.maxAvailable) },
      ]}
    />
  );
}
