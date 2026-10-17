import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { useOrdersPageData } from '../hooks/useOrders';
import { Seo } from '../components/seo/Seo';
import { OrdersList } from '../components/orders/OrdersList';
import { OrdersViewSwitch } from '../components/orders/OrdersViewSwitch';
import { GuestOrderClaims } from '../components/orders/GuestOrderClaims';
import { AccountShell } from '../components/account/AccountShell';
import type { MondialRelayPoint } from '../components/address/MondialRelayPickerModal';
import { shopConfig } from '../config/env';
import styles from './AccountAddressesPage.module.css';

const ORDER_ADDRESS_PICKER_RESULT_KEY = 'psn-order-address-picker-result';

type PickerResult = { orderId: string; mondialRelayPoint: MondialRelayPoint };

function takePickerResult(locationState: unknown): PickerResult | null {
  const routeResult = locationState as Partial<PickerResult> | null;
  try {
    const stored = window.sessionStorage.getItem(ORDER_ADDRESS_PICKER_RESULT_KEY);
    window.sessionStorage.removeItem(ORDER_ADDRESS_PICKER_RESULT_KEY);
    if (routeResult?.orderId && routeResult.mondialRelayPoint) return routeResult as PickerResult;
    if (!stored) return null;
    const result = JSON.parse(stored) as Partial<PickerResult>;
    return result.orderId && result.mondialRelayPoint ? (result as PickerResult) : null;
  } catch {
    return null;
  }
}

export function OrdersPage() {
  const { t } = useLang();
  const location = useLocation();
  const {
    activeOrders,
    guestOrderCandidates,
    loading,
    refreshOrders,
    removeGuestOrderCandidate,
    activeHasMore,
    loadingMoreActive,
    loadMoreActive,
  } = useOrdersPageData();

  const [pickerResult, setPickerResult] = useState(() => takePickerResult(location.state));

  return (
    <AccountShell loading={loading}>
      <section aria-labelledby="orders-h" className={styles.section}>
        <Seo title={t.ordersPage.activeTitle} description={t.ordersPage.activeTitle} path="/orders" noindex />
        <OrdersViewSwitch />
        {!loading && (
          <GuestOrderClaims
            scope="active"
            orders={guestOrderCandidates}
            onClaimed={refreshOrders}
            onRemoved={removeGuestOrderCandidate}
          />
        )}
        <h1 id="orders-h" className={`${styles.title} ${styles.hasSubtitle}`}>
          {t.ordersPage.activeTitle}
        </h1>
        <p className={styles.subtitle}>{t.ordersPage.activeSubtitle}</p>
        {!loading && (
          <>
            <OrdersList
              orders={activeOrders}
              emptyMessage={t.ordersPage.emptyActive}
              scope="active"
              listTestId="orders-list"
              {...(pickerResult?.orderId ? { initialEditOrderId: pickerResult.orderId } : {})}
              onInitialShippingAddressHandled={() => setPickerResult(null)}
              {...(pickerResult?.mondialRelayPoint
                ? {
                    initialShippingAddress: {
                      // The relay's name travels with the pickup reference and
                      // is displayed as the address's first line, so `label`
                      // stays the customer's own free-text name (see
                      // AccountAddressesPage).
                      line1: pickerResult.mondialRelayPoint.line1,
                      line2: pickerResult.mondialRelayPoint.line2 || null,
                      postalCode: pickerResult.mondialRelayPoint.postalCode,
                      city: pickerResult.mondialRelayPoint.city,
                      countryCode: pickerResult.mondialRelayPoint.countryCode,
                      networkCodes: [shopConfig.mondialRelayPickerNetworkCode],
                      pickupPoints: {
                        [shopConfig.mondialRelayPickerNetworkCode]: {
                          id: pickerResult.mondialRelayPoint.id,
                          name: pickerResult.mondialRelayPoint.name,
                        },
                      },
                    },
                  }
                : {})}
            />
            {activeHasMore ? (
              <p className={styles.subtitle}>
                <button
                  type="button"
                  className={styles.loadMoreButton}
                  data-testid="orders-active-load-more"
                  disabled={loadingMoreActive}
                  onClick={() => void loadMoreActive()}
                >
                  {loadingMoreActive ? t.ordersPage.loadingMoreOrders : t.ordersPage.loadMoreOrders}
                </button>
              </p>
            ) : null}
          </>
        )}
      </section>
    </AccountShell>
  );
}
