import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ApiError } from '../api/errors';
import { adminOrderActionError } from '../api/adminOrderActionError';
import {
  downloadAdminOrderSticker,
  retryAdminOrderReturnEmail,
  getAdminOrder,
  getAdminOrderTracking,
  listAdminOrders,
  resolveAdminNeedReviewOrder,
  updateAdminOrderStatus,
  verifyAdminOrder,
  type AdminOrder,
  type AdminOrderSummary,
  type StripeResolutionAudit,
} from '../api/admin/orders';
import { listCouriers, type Courier } from '../api/account';
import { useAuthSession } from '../state/AuthContext';
import { useAdminInfiniteList } from '../hooks/useAdminInfiniteList';
import { AdminInfiniteList } from '../components/admin/AdminInfiniteList';
import { AdminStatusTabs } from '../components/admin/AdminStatusTabs';
import { AdminDetailBar } from '../components/admin/AdminDetailBar';
import { useAdminSectionReset } from '../state/AdminChromeContext';
import { useToast } from '../state/ToastContext';
import type { AdminAttentionCounts } from '../hooks/useAdminAttentionCounts';
import { useLang } from '../assets/i18n';
import { formatPrice } from '../utils/formatPrice';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import styles from './AdminOrdersPage.module.css';

import {
  STATUS_TONE,
  type FilterValue,
  filterFromSearchParams,
  filterLabel,
  needReviewResolutionMessage,
  OrderOriginBadge,
  parseFilter,
  statusLabel,
  orderStatusTabs,
} from './admin/adminOrdersFilters';
import { OrderDetail, type OrderAction } from './admin/AdminOrderDetail';
import { OrderActionConfirm } from './admin/AdminOrderActionConfirm';
import { shopConfig } from '../config/env';

/** Fetch chunk for the infinite order list. Not a user-facing choice any
 * more: the admin scrolls, the list appends. */
const ORDERS_CHUNK_SIZE = 30;

/** Landing filter when the URL names none: the queue that starts the
 * fulfilment workflow. */
const DEFAULT_FILTER: FilterValue = 'confirmed';

export function AdminOrdersPage() {
  const { t } = useLang();
  const { authedRequest } = useAuthSession();
  const { counts, refreshAttentionCounts } = useOutletContext<{
    counts: AdminAttentionCounts;
    refreshAttentionCounts: () => Promise<void>;
  }>();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterValue>(
    () => filterFromSearchParams(searchParams) || DEFAULT_FILTER,
  );
  const [view, setView] = useState<'detail' | 'list'>('list');
  /** Window scroll of the list when a record was opened, restored on back. */
  const listScrollRef = useRef(0);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [capturePayment, setCapturePayment] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [skipShippingLabel, setSkipShippingLabel] = useState(false);
  const [pendingAction, setPendingAction] = useState<OrderAction | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [needReviewResolution, setNeedReviewResolution] = useState<'continue' | 'cancel' | null>(null);
  const [needReviewResult, setNeedReviewResult] = useState<StripeResolutionAudit | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const fetchOrders = useCallback(
    async (page: number) => {
      const parsed = parseFilter(filter);
      if (!parsed) return { rows: [], page: 1, totalPages: 0, total: 0 };
      const result = await withMinDuration(
        authedRequest((accessToken) =>
          listAdminOrders(accessToken, parsed.status, page, parsed.verified, ORDERS_CHUNK_SIZE),
        ),
        page === 1 ? 350 : 0,
      );
      return {
        rows: result.orders,
        page: result.pagination.page,
        totalPages: result.pagination.totalPages,
        total: result.pagination.total,
      };
    },
    [authedRequest, filter],
  );
  const {
    rows: orders,
    setRows: setOrders,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    setError,
    loadMore,
  } = useAdminInfiniteList<AdminOrderSummary>({
    fetchPage: fetchOrders,
    errorMessage: t.admin.actionError,
    enabled: filter !== '' && parseFilter(filter) !== null,
  });
  const busy = loading || detailLoading || acting;
  /** Index to open once an appended chunk has arrived (see moveOrder). */
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const selectOrderRef = useRef<(row: AdminOrderSummary) => Promise<void>>(async () => {});
  const initialFilterRef = useRef(filter);
  const selectFilterRef = useRef(selectFilter);
  selectFilterRef.current = selectFilter;
  const backToListRef = useRef(backToList);
  backToListRef.current = backToList;
  const loadingMessage = acting ? t.admin.actionLoading : t.admin.contentLoading;

  useEffect(() => {
    if (pendingStep === null) return;
    const row = orders[pendingStep];
    if (row) {
      setPendingStep(null);
      void selectOrderRef.current(row);
    } else if (!loadingMore) {
      setPendingStep(null);
    }
  }, [pendingStep, orders, loadingMore]);

  const resetSection = useCallback(() => backToListRef.current(), []);
  useAdminSectionReset(resetSection);

  useEffect(() => {
    // Public, unauthenticated catalogue — AdminOrder only carries the
    // courier's display name, not its code, so this is how the delivery
    // section resolves a logo (courierLogoUrl needs the code).
    void listCouriers()
      .then((result) => setCouriers(result.couriers))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // Deep-link bootstrap from dashboard cards / shared URLs, or the default
    // queue: a list shows right away, the status selector switches it.
    selectFilterRef.current(initialFilterRef.current);
  }, []);

  /** Back from a record to the list it was opened from, at the same scroll
   * position. */
  function backToList() {
    setView('list');
    setSelected(null);
    setTrackingUrl(null);
    setActionError(null);
    setNotice(null);
    setPendingAction(null);
    const top = listScrollRef.current;
    requestAnimationFrame(() => window.scrollTo({ top }));
  }

  /** Picking a filter only sets it; useAdminInfiniteList reloads from the
   * first chunk because `fetchOrders` gets a new identity. */
  function selectFilter(value: FilterValue) {
    setFilter(value);
    setView('list');
    setSelected(null);
    setTrackingUrl(null);
    setError(null);
    setActionError(null);
    setNotice(null);
    const parsed = value ? parseFilter(value) : null;
    if (!parsed) {
      setSearchParams({}, { replace: true });
      return;
    }
    const nextParams = new URLSearchParams({ status: parsed.status });
    if (parsed.verified !== undefined) nextParams.set('verified', String(parsed.verified));
    setSearchParams(nextParams, { replace: true });
  }

  selectOrderRef.current = selectOrder;

  async function selectOrder(order: AdminOrderSummary) {
    if (view === 'list') listScrollRef.current = window.scrollY;
    setDetailLoading(true);
    setTrackingUrl(null);
    setCapturePayment(false);
    setSkipShippingLabel(false);
    setPendingAction(null);
    setError(null);
    setActionError(null);
    setNotice(null);
    setView('detail');
    window.scrollTo({ top: 0 });
    try {
      const result = await withMinDuration(
        authedRequest((accessToken) => getAdminOrder(accessToken, order.id)),
        shopConfig.loadingMinMs.short,
      );
      setSelected(result.order);
      setNotifyCustomer(result.order.status === 'in_preparation' || result.order.status === 'to_send');
    } catch {
      setSelected(null);
      setError(t.admin.actionError);
    } finally {
      setDetailLoading(false);
    }
  }

  async function moveOrder(direction: -1 | 1) {
    if (!selected) return;
    const index = orders.findIndex((order) => order.id === selected.id);
    const adjacent = orders[index + direction];
    if (adjacent) {
      await selectOrder(adjacent);
      return;
    }
    // Stepping past the last loaded order: fetch the next chunk first, then
    // open what it appended. Backwards never needs this.
    if (direction !== 1 || !hasMore) return;
    await loadMore();
    setPendingStep(index + 1);
  }

  function removeAdvancedOrder(orderId: string) {
    const index = orders.findIndex((order) => order.id === orderId);
    const remaining = orders.filter((order) => order.id !== orderId);
    setOrders(remaining);
    const nextOrder = remaining[index] ?? remaining[index - 1];
    setSelected(null);
    // The queue moves on by itself: the next order opens, or the emptied
    // list comes back.
    if (nextOrder) void selectOrder(nextOrder);
    else setView('list');
    setTrackingUrl(null);
    setCapturePayment(false);
    setNotifyCustomer(false);
    setNeedReviewResolution(null);
    setPendingAction(null);
  }

  /** Confirmation for a status move that took the order out of this list:
   * the order is gone from the screen, so the notice travels as a toast. */
  function announceAdvanced(orderNumber: string, status: string) {
    toast(`${orderNumber} : ${status}`);
  }

  async function resolveNeedReview(resolution: 'continue' | 'cancel') {
    if (!selected || busy || selected.status !== 'need_review') return;
    setNeedReviewResolution(null);
    setActing(true);
    setActionError(null);
    setNotice(t.admin.actionLoading);
    try {
      const result = await withMinDuration(
        authedRequest((accessToken) =>
          resolveAdminNeedReviewOrder(accessToken, selected.id, { decision: resolution, confirmed: true }),
        ),
        shopConfig.loadingMinMs.short,
      );
      // The resolved order leaves this filter, so drop it from the loaded
      // rows rather than refetching every chunk the admin had scrolled through.
      removeAdvancedOrder(selected.id);
      setNeedReviewResult(result.stripeResolution);
      void refreshAttentionCounts();
      setNotice(t.admin.actionSuccess);
    } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : null;
      setActionError(
        code === 'review_blocked'
          ? t.admin.needReviewOrderBlocked
          : code === 'stripe_not_configured'
            ? t.admin.needReviewOrderStripeNotConfigured
            : code === 'stripe_state_invalid'
              ? t.admin.needReviewOrderStripeStateInvalid
              : code === 'stripe_action_failed'
                ? t.admin.needReviewOrderStripeActionFailed
                : code === 'stripe_refund_pending'
                  ? t.admin.needReviewOrderStripeRefundPending
                  : t.admin.actionError,
      );
      setNotice(null);
    } finally {
      setActing(false);
    }
  }

  async function prepareOrder() {
    if (!selected || busy) return;
    setActing(true);
    setActionError(null);
    setNotice(t.admin.actionLoading);
    try {
      await withMinDuration(
        authedRequest((accessToken) =>
          updateAdminOrderStatus(accessToken, selected.id, {
            status: 'in_preparation',
            ...(capturePayment ? {} : { noPayment: true }),
            ...(notifyCustomer ? { notifyCustomer: true } : {}),
          }),
        ),
        shopConfig.loadingMinMs.short,
      );
      removeAdvancedOrder(selected.id);
      void refreshAttentionCounts();
      announceAdvanced(selected.orderNumber, t.ordersPage.statusInPreparation);
    } catch (reason) {
      setActionError(adminOrderActionError(reason, t.admin));
      setNotice(null);
    } finally {
      setActing(false);
    }
  }

  async function releaseToSend() {
    if (!selected || busy || selected.status !== 'in_preparation') return;
    setActing(true);
    setActionError(null);
    setNotice(t.admin.actionLoading);
    try {
      await withMinDuration(
        authedRequest((accessToken) =>
          updateAdminOrderStatus(accessToken, selected.id, {
            status: 'to_send',
            ...(notifyCustomer ? { notifyCustomer: true } : {}),
            ...(skipShippingLabel ? { skipShippingLabel: true } : {}),
          }),
        ),
        shopConfig.loadingMinMs.short,
      );
      removeAdvancedOrder(selected.id);
      void refreshAttentionCounts();
      announceAdvanced(selected.orderNumber, t.ordersPage.statusToSend);
    } catch (reason) {
      setActionError(adminOrderActionError(reason, t.admin));
      setNotice(null);
    } finally {
      setActing(false);
    }
  }

  async function markShipped() {
    if (!selected || busy || selected.status !== 'to_send') return;
    setActing(true);
    setActionError(null);
    setNotice(t.admin.actionLoading);
    try {
      await withMinDuration(
        authedRequest((accessToken) => updateAdminOrderStatus(accessToken, selected.id, { status: 'sent' })),
        shopConfig.loadingMinMs.short,
      );
      removeAdvancedOrder(selected.id);
      void refreshAttentionCounts();
      announceAdvanced(selected.orderNumber, t.ordersPage.statusSent);
    } catch (reason) {
      setActionError(adminOrderActionError(reason, t.admin));
      setNotice(null);
    } finally {
      setActing(false);
    }
  }

  async function confirmForcedShipmentAction(target: 'received' | 'return') {
    if (!selected || busy) return;
    if (selected.status !== 'sent' && selected.status !== 'disponible') return;
    setActing(true);
    setActionError(null);
    setNotice(t.admin.actionLoading);
    try {
      await withMinDuration(
        authedRequest((accessToken) =>
          updateAdminOrderStatus(
            accessToken,
            selected.id,
            target === 'received' ? { advanceToReceived: true } : { advanceToReturnReview: true },
          ),
        ),
        shopConfig.loadingMinMs.short,
      );
      removeAdvancedOrder(selected.id);
      void refreshAttentionCounts();
      announceAdvanced(
        selected.orderNumber,
        target === 'received' ? t.ordersPage.statusReceived : t.admin.returnReviewOrderStatus,
      );
    } catch (reason) {
      setActionError(adminOrderActionError(reason, t.admin));
      setNotice(null);
    } finally {
      setActing(false);
    }
  }

  async function verifyOrder() {
    if (!selected || busy) return;
    setActing(true);
    setActionError(null);
    setNotice(t.admin.actionLoading);
    try {
      const result = await withMinDuration(
        authedRequest((accessToken) => verifyAdminOrder(accessToken, selected.id)),
        shopConfig.loadingMinMs.short,
      );
      if (filter === 'received:false' || filter === 'cancelled:false') {
        removeAdvancedOrder(selected.id);
        announceAdvanced(selected.orderNumber, t.admin.orderVerified);
        void refreshAttentionCounts();
        return;
      }
      setSelected(result.order);
      setOrders((current) =>
        current.map((order) => (order.id === result.order.id ? { ...order, adminVerified: true } : order)),
      );
      void refreshAttentionCounts();
      setNotice(t.admin.actionSuccess);
    } catch (reason) {
      setActionError(adminOrderActionError(reason, t.admin));
      setNotice(null);
    } finally {
      setActing(false);
    }
  }

  function returnReviewCompleted(orderId: string) {
    removeAdvancedOrder(orderId);
    void refreshAttentionCounts();
    toast(t.admin.actionSuccess);
  }

  function runPendingAction() {
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'prepare') void prepareOrder();
    else if (action === 'release') void releaseToSend();
    else if (action === 'ship') void markShipped();
    else if (action === 'received' || action === 'return') void confirmForcedShipmentAction(action);
  }

  async function retryReturnEmail() {
    if (!selected || busy) return;
    setActing(true);
    setActionError(null);
    try {
      const result = await authedRequest((accessToken) =>
        retryAdminOrderReturnEmail(accessToken, selected.id),
      );
      setSelected(result.order);
      setNotice(result.emailStatus === 'sent' ? t.admin.actionSuccess : t.admin.returnReviewEmailFailed);
    } catch (reason) {
      setActionError(adminOrderActionError(reason, t.admin));
    } finally {
      setActing(false);
    }
  }

  async function downloadSticker() {
    if (!selected || busy) return;
    setActing(true);
    setActionError(null);
    try {
      await withMinDuration(
        authedRequest((accessToken) =>
          downloadAdminOrderSticker(accessToken, selected.id, selected.orderNumber),
        ),
        shopConfig.loadingMinMs.short,
      );
    } catch (reason) {
      setActionError(adminOrderActionError(reason, t.admin));
    } finally {
      setActing(false);
    }
  }

  async function loadTracking() {
    if (!selected || busy) return;
    // Open the browsing context while this click is still user-initiated so
    // browsers do not block it as an asynchronous popup after the API has
    // resolved the carrier URL.
    const trackingWindow = window.open('', '_blank');
    if (trackingWindow) trackingWindow.opener = null;
    setActing(true);
    setActionError(null);
    try {
      const result = await withMinDuration(
        authedRequest((accessToken) => getAdminOrderTracking(accessToken, selected.id)),
        shopConfig.loadingMinMs.short,
      );
      const url = result.tracking.externalUrl;
      if (!url) {
        trackingWindow?.close();
        setActionError(t.admin.actionError);
        return;
      }
      setTrackingUrl(url);
      if (trackingWindow) trackingWindow.location.replace(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
      try {
        const refreshed = await authedRequest((accessToken) => getAdminOrder(accessToken, selected.id));
        if (refreshed.order.status !== selected.status) {
          void refreshAttentionCounts();
          const expectedStatus = parseFilter(filter)?.status;
          if (expectedStatus && refreshed.order.status !== expectedStatus) {
            removeAdvancedOrder(selected.id);
          } else {
            setSelected(refreshed.order);
          }
        }
      } catch {
        // Carrier page already opened; leave the admin badge as-is.
      }
    } catch (reason) {
      trackingWindow?.close();
      setActionError(adminOrderActionError(reason, t.admin));
    } finally {
      setActing(false);
    }
  }

  const statusTabs = orderStatusTabs(filter, counts, t);

  const showBrowseUi = !(view === 'detail' && selected && !detailLoading);
  // The list is always fetched for exactly one status filter, so every row
  // shares it: AdminOrderSummary itself carries no per-row status field.
  const filterStatus = parseFilter(filter)?.status ?? null;
  const selectedIndex = selected ? orders.findIndex((order) => order.id === selected.id) : -1;

  return (
    <section className={styles.section} aria-labelledby="admin-orders-h">
      <Seo
        title={t.admin.ordersTitle}
        description={t.admin.ordersDescription}
        path={adminPath('/orders')}
        noindex
      />

      {showBrowseUi && (
        <>
          <div className={styles.controls}>
            <h1 id="admin-orders-h" className={styles.title}>
              {t.admin.ordersTitle}
            </h1>
            {filter && !loading && total > 0 && <span className={styles.totalCount}>{total}</span>}
          </div>
          <AdminStatusTabs
            label={t.admin.selectStatus}
            tabs={statusTabs}
            active={filter}
            onSelect={(value) => {
              if (value !== filter) selectFilter(value);
            }}
            closeLabel={t.gallery.close}
          >
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {filter && !busy && orders.length === 0 && !error && (
              <p className={styles.empty}>{t.admin.noOrders}</p>
            )}
            {orders.length > 0 && (
              <AdminInfiniteList
                className={styles.cardGrid}
                dividers={false}
                cardMinWidth={300}
                label={t.admin.ordersTitle}
                count={orders.length}
                rowKey={(index) => orders[index]!.id}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
                renderRow={(index) => {
                  const order = orders[index]!;
                  return (
                    <button
                      type="button"
                      className={styles.orderCard}
                      onClick={() => void selectOrder(order)}
                    >
                      <span className={styles.orderCardMain}>
                        <span className={styles.orderCardTop}>
                          <strong className={styles.orderNumberMono}>{order.orderNumber}</strong>
                          <span className={styles.orderCardBadges}>
                            <OrderOriginBadge placedAsGuest={order.placedAsGuest} t={t} />
                            {filterStatus && (
                              <span className={`${styles.statusBadge} ${STATUS_TONE[filterStatus]}`}>
                                {statusLabel(filterStatus, t)}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className={styles.orderCardEmail}>{order.userEmail ?? '-'}</span>
                        <span className={styles.orderCardMeta}>
                          {order.itemCount} · {t.admin.itemCount}
                        </span>
                      </span>
                      <span className={styles.orderCardTotal}>{formatPrice(order.total)}</span>
                    </button>
                  );
                }}
              />
            )}
          </AdminStatusTabs>
        </>
      )}

      {!showBrowseUi && selected && (
        <div className={styles.detailOnly}>
          <h1 id="admin-orders-h" className="visuallyHidden">
            {t.admin.orderDetails}
          </h1>
          <AdminDetailBar
            backLabel={filter ? filterLabel(filter, t) : t.admin.ordersTitle}
            onBack={backToList}
            position={selectedIndex + 1}
            total={total}
            canPrevious={selectedIndex > 0}
            canNext={selectedIndex >= 0 && (selectedIndex < orders.length - 1 || hasMore)}
            busy={busy}
            onPrevious={() => void moveOrder(-1)}
            onNext={() => void moveOrder(1)}
            previousLabel={t.admin.previousOrder}
            nextLabel={t.admin.nextOrder}
            navLabel={t.admin.orderDetails}
          />
          <OrderDetail
            order={selected}
            t={t}
            couriers={couriers}
            acting={acting}
            trackingUrl={trackingUrl}
            notice={notice}
            actionError={actionError}
            onAction={setPendingAction}
            onVerify={() => void verifyOrder()}
            onResolveNeedReview={(resolution) => setNeedReviewResolution(resolution)}
            onReturnCompleted={() => returnReviewCompleted(selected.id)}
            onRetryReturnEmail={() => void retryReturnEmail()}
            onDownload={() => void downloadSticker()}
            onTracking={() => void loadTracking()}
          />
        </div>
      )}

      {pendingAction && selected && (
        <OrderActionConfirm
          action={pendingAction}
          orderNumber={selected.orderNumber}
          t={t}
          capturePayment={capturePayment}
          setCapturePayment={setCapturePayment}
          notifyCustomer={notifyCustomer}
          setNotifyCustomer={setNotifyCustomer}
          skipShippingLabel={skipShippingLabel}
          setSkipShippingLabel={setSkipShippingLabel}
          onConfirm={runPendingAction}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {needReviewResolution && (
        <ConfirmModal
          variant="dialog"
          title={
            needReviewResolution === 'cancel'
              ? t.admin.needReviewOrderCancelTitle
              : t.admin.needReviewOrderContinueTitle
          }
          message={
            needReviewResolution === 'cancel'
              ? t.admin.needReviewOrderCancelMessage
              : t.admin.needReviewOrderContinueMessage
          }
          confirmLabel={
            needReviewResolution === 'cancel'
              ? t.admin.needReviewOrderCancelConfirm
              : t.admin.needReviewOrderContinueConfirm
          }
          closeLabel={t.gallery.close}
          confirmDanger={needReviewResolution === 'cancel'}
          onConfirm={() => void resolveNeedReview(needReviewResolution)}
          onCancel={() => setNeedReviewResolution(null)}
        />
      )}

      {needReviewResult && (
        <ConfirmModal
          variant="dialog"
          title={t.admin.needReviewOrderResolvedTitle}
          message={needReviewResolutionMessage(needReviewResult, t)}
          confirmLabel={t.gallery.close}
          closeLabel={t.gallery.close}
          onConfirm={() => setNeedReviewResult(null)}
          onCancel={() => setNeedReviewResult(null)}
        />
      )}

      {busy && <LoadingModal message={loadingMessage} />}
    </section>
  );
}
