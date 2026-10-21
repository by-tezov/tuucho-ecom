import { useLang } from '../assets/i18n';
import { useOrdersPageData } from '../hooks/useOrders';
import { Seo } from '../components/seo/Seo';
import { OrdersList } from '../components/orders/OrdersList';
import { OrdersViewSwitch } from '../components/orders/OrdersViewSwitch';
import { GuestOrderClaims } from '../components/orders/GuestOrderClaims';
import { AccountShell } from '../components/account/AccountShell';
import styles from './AccountAddressesPage.module.css';

export function OrdersHistoryPage() {
  const { t } = useLang();
  const {
    historyOrders,
    guestOrderCandidates,
    loading,
    refreshOrders,
    removeGuestOrderCandidate,
    historyHasMore,
    loadingMoreHistory,
    loadMoreHistory,
  } = useOrdersPageData();

  return (
    <AccountShell loading={loading}>
      <section aria-labelledby="orders-history-h" className={styles.section}>
        <Seo
          title={t.ordersPage.historyTitle}
          description={t.ordersPage.historyTitle}
          path="/orders/history"
          noindex
        />
        <OrdersViewSwitch />
        {!loading && (
          <GuestOrderClaims
            scope="history"
            orders={guestOrderCandidates}
            onClaimed={refreshOrders}
            onRemoved={removeGuestOrderCandidate}
          />
        )}
        <h1 id="orders-history-h" className={`${styles.title} ${styles.hasSubtitle}`}>
          {t.ordersPage.historyTitle}
        </h1>
        <p className={styles.subtitle}>{t.ordersPage.historySubtitle}</p>
        {!loading && (
          <>
            <OrdersList
              orders={historyOrders}
              emptyMessage={t.ordersPage.emptyHistory}
              scope="history"
              listTestId="orders-history-list"
            />
            {historyHasMore ? (
              <p className={styles.subtitle}>
                <button
                  type="button"
                  className={styles.loadMoreButton}
                  data-testid="orders-history-load-more"
                  disabled={loadingMoreHistory}
                  onClick={() => void loadMoreHistory()}
                >
                  {loadingMoreHistory ? t.ordersPage.loadingMoreOrders : t.ordersPage.loadMoreOrders}
                </button>
              </p>
            ) : null}
          </>
        )}
      </section>
    </AccountShell>
  );
}
