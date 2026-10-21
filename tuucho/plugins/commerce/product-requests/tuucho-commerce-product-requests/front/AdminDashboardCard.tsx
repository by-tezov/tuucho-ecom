import { useOutletContext } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { adminPath } from '@kernel/front/utils/adminRoute';
import type { AdminAttentionCounts } from '@kernel/front/hooks/useAdminAttentionCounts';
import { AdminAttentionCard } from '@kernel/front/ui';

export function AdminDashboardCard() {
  const { t } = useLang();
  const { counts } = useOutletContext<{ counts: AdminAttentionCounts }>();
  if (!counts.productRequestsRequested) return null;
  return (
    <AdminAttentionCard
      count={counts.productRequestsRequested}
      label={t.admin.badgeRequestedProductRequests}
      to={`${adminPath('/product-requests')}?status=requested`}
      tone="purple"
    />
  );
}
