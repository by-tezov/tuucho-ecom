import { Link, useOutletContext } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { adminPath } from '@kernel/front/utils/adminRoute';
import type { AdminAttentionCounts } from '@kernel/front/hooks/useAdminAttentionCounts';
import styles from '@kernel/front/routes/AdminPage.module.css';

export function AdminDashboardCard() {
  const { t } = useLang();
  const { counts } = useOutletContext<{ counts: AdminAttentionCounts }>();
  if (!counts.productRequestsRequested) return null;
  return (
    <Link
      to={`${adminPath('/product-requests')}?status=requested`}
      className={`${styles.urgentCard} ${styles.urgent_purple}`}
    >
      <span className={styles.urgentCount}>{counts.productRequestsRequested}</span>
      <span className={styles.urgentLabel}>{t.admin.badgeRequestedProductRequests}</span>
    </Link>
  );
}
