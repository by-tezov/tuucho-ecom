import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
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

const SIZES = ['XS', 'S', 'M', 'L'] as const;

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return formatPrice(value);
}

interface UrgentCard {
  count: number;
  label: string;
  to: string;
  tone: 'red' | 'orange' | 'purple' | 'blue';
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
          // Open conversations first; with none, the contact inbox is
          // where the waiting messages are.
          to: (counts.chatsOpen ?? 0) > 0 ? adminPath('/chats') : adminPath('/unconnected-contacts'),
          tone: 'blue',
        }
      : null,
  ].filter((card): card is UrgentCard => card !== null);
  // Every count still null means the first fetch has not landed: no
  // "all clear" before we actually know.
  // A role holding neither section has nothing to wait for.
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
        {countsLoaded && urgent.length === 0 && <p className={styles.allClear}>{a.dashboard.allClear}</p>}
        {urgent.length > 0 && (
          <div className={styles.urgentRow}>
            {urgent.map((card) => (
              <Link
                key={card.label}
                to={card.to}
                className={`${styles.urgentCard} ${styles[`urgent_${card.tone}`]} ${
                  card.exception ? styles.urgentException : ''
                }`}
              >
                <span className={styles.urgentCount}>{card.count}</span>
                <span className={styles.urgentLabel}>{card.label}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
      {!showStats && (
        <div className={styles.statsGrid}>
          <PluginSlot name={CORE_FRONT_SLOTS.adminDashboard} />
        </div>
      )}

      {showStats && (
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
            {stats && (
              <>
              <article className={styles.statCard}>
                <h3>{t.admin.libraryStockTitle}</h3>
                <dl className={styles.metrics}>
                  <div>
                    <dt>{a.dashboard.totalQuantity}</dt>
                    <dd>{stats.library.quantity}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.totalValue}</dt>
                    <dd>{money(stats.library.stockValue)}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.minPrice}</dt>
                    <dd>{money(stats.library.minUnitPrice)}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.avgPrice}</dt>
                    <dd>{money(stats.library.averageUnitPrice)}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.maxPrice}</dt>
                    <dd>{money(stats.library.maxUnitPrice)}</dd>
                  </div>
                </dl>
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
              </article>

              <article className={styles.statCard}>
                <h3>{t.admin.accessoryStockTitle}</h3>
                <dl className={styles.metrics}>
                  <div>
                    <dt>{a.dashboard.totalQuantity}</dt>
                    <dd>{stats.accessories.quantity}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.totalValue}</dt>
                    <dd>{money(stats.accessories.stockValue)}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.avgPrice}</dt>
                    <dd>{money(stats.accessories.averageUnitPrice)}</dd>
                  </div>
                </dl>
              </article>

              <article className={styles.statCard}>
                <h3>{t.admin.ordersTitle}</h3>
                <dl className={styles.metrics}>
                  <div>
                    <dt>{a.dashboard.confirmed}</dt>
                    <dd>{stats.orders.confirmed}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.sent}</dt>
                    <dd>{stats.orders.sent}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.received}</dt>
                    <dd>{stats.orders.received}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.cancelled}</dt>
                    <dd>{stats.orders.cancelled}</dd>
                  </div>
                </dl>
              </article>

              <article className={styles.statCard}>
                <h3>{a.dashboard.sales}</h3>
                <dl className={styles.metrics}>
                  <div>
                    <dt>{a.dashboard.items}</dt>
                    <dd>{money(stats.orders.merchandiseSold)}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.shipping}</dt>
                    <dd>{money(stats.orders.shippingPaid)}</dd>
                  </div>
                  <div>
                    <dt>{a.dashboard.total}</dt>
                    <dd>{money(stats.orders.totalSold)}</dd>
                  </div>
                </dl>
              </article>
              </>
            )}
          </div>
        </section>
      )}

      {statsLoading && !stats && (
        <p className={styles.loadingHint} role="status">
          {t.admin.contentLoading}
        </p>
      )}
    </section>
    </AdminDashboardContext.Provider>
  );
}
