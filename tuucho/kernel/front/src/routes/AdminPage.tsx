import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { useLang } from '../assets/i18n';
import { getAdminStats, type AdminStats } from '../api/admin/stats';
import { useAuthSession } from '../state/AuthContext';
import { adminPath } from '../utils/adminRoute';
import { formatPrice } from '../utils/formatPrice';
import { withMinDuration } from '../utils/withMinDuration';
import type { AdminAttentionCounts } from '../hooks/useAdminAttentionCounts';
import styles from './AdminPage.module.css';
import { shopConfig } from '../config/env';
import { useAdminStrings } from '../assets/i18n/admin';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';
import { CORE_FRONT_SLOTS, PluginSlot } from '../plugins/PluginHost';
import { AdminDashboardContext } from './AdminDashboardContext';
import {
  AdminAttentionCard,
  type AdminAttentionTone,
} from '../components/ui/AdminAttentionCard';
import { AdminStatCard } from '../components/ui/AdminStatCard';

const SIZES = ['XS', 'S', 'M', 'L'] as const;

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return formatPrice(value);
}

interface UrgentCard {
  count: number;
  label: string;
  to: string;
  tone: AdminAttentionTone;
  exception?: boolean;
}

export function AdminPage() {
  const { t } = useLang();
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const { counts } = useOutletContext<{ counts: AdminAttentionCounts }>();
  const access = useAdminAccess();
  const showStats = canAccess(access, 'stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(showStats);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (!showStats) return;
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    void (async () => {
      try {
        const result = await withMinDuration(
          authedRequest((token) => getAdminStats(token)),
          shopConfig.loadingMinMs.short,
        );
        if (cancelled) return;
        setStats(result);
      } catch {
        if (!cancelled) setStatsError(t.admin.actionError);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, showStats, t.admin.actionError]);

  const urgent: UrgentCard[] = [
    counts.orders && counts.orders.returnReview > 0
      ? {
          count: counts.orders.returnReview,
          label: t.admin.returnReviewOrderBadge,
          to: `${adminPath('/orders')}?status=return_review`,
          tone: 'orange',
          exception: true,
        }
      : null,
    counts.orders && counts.orders.needReview > 0
      ? {
          count: counts.orders.needReview,
          label: t.admin.needReviewOrderBadge,
          to: `${adminPath('/orders')}?status=need_review`,
          tone: 'red',
          exception: true,
        }
      : null,
    counts.orders && counts.orders.confirmed > 0
      ? {
          count: counts.orders.confirmed,
          label: t.admin.badgeConfirmed,
          to: `${adminPath('/orders')}?status=confirmed`,
          tone: 'red',
        }
      : null,
    (counts.ordersInPreparation ?? 0) > 0
      ? {
          count: counts.ordersInPreparation ?? 0,
          label: t.ordersPage.statusInPreparation,
          to: `${adminPath('/orders')}?status=in_preparation`,
          tone: 'blue',
        }
      : null,
    (counts.ordersToSend ?? 0) > 0
      ? {
          count: counts.ordersToSend ?? 0,
          label: t.ordersPage.statusToSend,
          to: `${adminPath('/orders')}?status=to_send`,
          tone: 'purple',
        }
      : null,
    counts.orders && counts.orders.disponible > 0
      ? {
          count: counts.orders.disponible,
          label: t.admin.badgeDisponible,
          to: `${adminPath('/orders')}?status=disponible`,
          tone: 'orange',
        }
      : null,
    (counts.chatsOpen ?? 0) + (counts.contactsNew ?? 0) > 0
      ? {
          count: (counts.chatsOpen ?? 0) + (counts.contactsNew ?? 0),
          label: t.admin.badgeOpenChats,
          to: (counts.chatsOpen ?? 0) > 0 ? adminPath('/chats') : adminPath('/unconnected-contacts'),
          tone: 'blue',
        }
      : null,
  ].filter((card): card is UrgentCard => card !== null);
  const countsLoaded =
    counts.orders !== null ||
    counts.chatsOpen !== null ||
    (!canAccess(access, 'orders') && !canAccess(access, 'messages'));

  return (
    <AdminDashboardContext.Provider value={{ stats }}>
      <section className={styles.section} aria-labelledby="admin-h">
        <Seo title={t.admin.pageTitle} description={t.admin.pageTitle} path={adminPath()} noindex />
        <h1 id="admin-h" className={styles.title}>
          {t.admin.pageTitle}
        </h1>

        <section aria-labelledby="admin-urgent-h" className={styles.urgentSection}>
          <h2 id="admin-urgent-h" className={styles.sectionHeading}>
            {t.admin.urgentSectionTitle}
          </h2>
          {countsLoaded && urgent.length === 0 && (
            <p className={styles.allClear}>{a.dashboard.allClear}</p>
          )}
          <div className={styles.urgentRow}>
            {urgent.map((card) => (
              <AdminAttentionCard
                key={card.label}
                count={card.count}
                label={card.label}
                to={card.to}
                tone={card.tone}
                exception={card.exception}
              />
            ))}
            <PluginSlot name={CORE_FRONT_SLOTS.adminDashboardAttention} />
          </div>
        </section>

        <section aria-labelledby="admin-stats-h" className={styles.statsSection}>
          <h2 id="admin-stats-h" className={styles.sectionHeading}>
            {t.admin.statsTitle}
          </h2>
          {statsError && (
            <p className={styles.error} role="alert">
              {statsError}
            </p>
          )}
          <div className={styles.statsGrid}>
            <PluginSlot name={CORE_FRONT_SLOTS.adminDashboard} />
            {showStats && stats && (
              <>
                <AdminStatCard
                  title={t.admin.libraryStockTitle}
                  metrics={[
                    { label: a.dashboard.totalQuantity, value: stats.library.quantity },
                    { label: a.dashboard.totalValue, value: money(stats.library.stockValue) },
                    { label: a.dashboard.minPrice, value: money(stats.library.minUnitPrice) },
                    { label: a.dashboard.avgPrice, value: money(stats.library.averageUnitPrice) },
                    { label: a.dashboard.maxPrice, value: money(stats.library.maxUnitPrice) },
                  ]}
                >
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">{a.dashboard.size}</th>
                          <th scope="col">{a.dashboard.qtyShort}</th>
                          <th scope="col">{a.dashboard.value}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SIZES.map((size) => (
                          <tr key={size}>
                            <th scope="row">{size}</th>
                            <td>{stats.library.bySize[size].quantity}</td>
                            <td>{money(stats.library.bySize[size].stockValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AdminStatCard>

                <AdminStatCard
                  title={t.admin.accessoryStockTitle}
                  metrics={[
                    { label: a.dashboard.totalQuantity, value: stats.accessories.quantity },
                    { label: a.dashboard.totalValue, value: money(stats.accessories.stockValue) },
                    { label: a.dashboard.avgPrice, value: money(stats.accessories.averageUnitPrice) },
                  ]}
                />

                <AdminStatCard
                  title={t.admin.ordersTitle}
                  metrics={[
                    { label: a.dashboard.confirmed, value: stats.orders.confirmed },
                    { label: a.dashboard.sent, value: stats.orders.sent },
                    { label: a.dashboard.received, value: stats.orders.received },
                    { label: a.dashboard.cancelled, value: stats.orders.cancelled },
                  ]}
                />

                <AdminStatCard
                  title={a.dashboard.sales}
                  metrics={[
                    { label: a.dashboard.items, value: money(stats.orders.merchandiseSold) },
                    { label: a.dashboard.shipping, value: money(stats.orders.shippingPaid) },
                    { label: a.dashboard.total, value: money(stats.orders.totalSold) },
                  ]}
                />
              </>
            )}
          </div>
        </section>

        {statsLoading && !stats && (
          <p className={styles.loadingHint} role="status">
            {t.admin.contentLoading}
          </p>
        )}
      </section>
    </AdminDashboardContext.Provider>
  );
}
