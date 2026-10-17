import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useCartCommands, useCartData } from '../../hooks/useCart';
import { useOrders } from '../../hooks/useOrders';
import { formatPrice } from '../../utils/formatPrice';
import { toFlagEmoji } from '../../utils/countryFlag';
import { OrderItemSections } from './OrderItemSections';
import { OrderItemGroup } from './OrderItemGroup';
import type { Address } from '../../api/account';
import type { Order } from '../../api/orders';
import { isBackendUnavailableError } from '../../api/http';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { LoadingModal } from '../ui/LoadingModal';
import { StatusModal } from '../ui/StatusModal';
import { TrackPackageModal } from './TrackPackageModal';
import { InvoiceModal } from './InvoiceModal';
import { GiftOrderNote } from './GiftOrderNote';
import { EditOrderBillingModal } from './EditOrderBillingModal';
import { OrderRevisionsModal } from './OrderRevisionsModal';
import { RebuyCartDialog } from '../cart/RebuyCartDialog';
import {
  ConfirmItemsCountSummary,
  ConfirmDeliveryAddressPreview,
  orderPaidAndGiftQuantities,
} from '../checkout/CheckoutConfirmationShell';
import styles from './OrdersList.module.css';
// Shares the cart page's own line/photo/variant styling — same grouped
// set+shape card look rather than duplicating those rules here.
import cartStyles from '../cart/CartFeature.module.css';
import checkoutStyles from '../cart/CartCheckoutSection.module.css';

function statusLabel(status: Order['status'], t: ReturnType<typeof useLang>['t']): string {
  switch (status) {
    case 'confirmed':
      return t.ordersPage.statusConfirmed;
    case 'in_preparation':
      return t.ordersPage.statusInPreparation;
    case 'to_send':
      return t.ordersPage.statusToSend;
    case 'sent':
      return t.ordersPage.statusSent;
    case 'disponible':
      return t.ordersPage.statusDisponible;
    case 'received':
      return t.ordersPage.statusReceived;
    case 'cancelled':
      return t.ordersPage.statusCancelled;
    case 'need_review':
      return '';
    case 'return_review':
      return t.ordersPage.statusReturnReview;
  }
}

function paymentCaptureLabel(
  status: Order['paymentCaptureStatus'],
  t: ReturnType<typeof useLang>['t'],
): string {
  switch (status) {
    case 'authorized':
      return t.ordersPage.paymentAuthorizedLabel;
    case 'captured':
      return t.ordersPage.paymentCapturedLabel;
    case 'not_required':
      return t.ordersPage.paymentNotRequiredLabel;
    case 'canceled':
      return t.ordersPage.paymentCanceledLabel;
    case 'expired':
      return t.ordersPage.paymentExpiredLabel;
  }
}

function paymentMethodLabel(order: Order, t: ReturnType<typeof useLang>['t']): string | null {
  const method = order.paymentMethod;
  if (!method) return null;
  // Free / zero-total orders already say "Aucun paiement" above — no second line.
  if (method.type === 'free') return null;
  if (method.type === 'paypal') return t.ordersPage.paymentMethodPaypalLabel;
  if (method.type === 'bancontact') return t.ordersPage.paymentMethodBancontactLabel;
  if (method.brand && method.last4) {
    const brand = method.brand.charAt(0).toUpperCase() + method.brand.slice(1);
    return t.ordersPage.paymentMethodCardLabel.replace('{brand}', brand).replace('{last4}', method.last4);
  }
  return t.ordersPage.paymentMethodCardUnknownLabel;
}

function formatOrderDate(confirmedAt: string, lang: ReturnType<typeof useLang>['lang']): string {
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(confirmedAt));
}

interface OrdersListProps {
  orders: Order[];
  emptyMessage: string;
  /** Which of the two order pages this renders for — decides which action
   * (cancel/track/invoice) applies, since orders are immutable and the two
   * pages otherwise share this exact same card. */
  scope: 'active' | 'history';
  listTestId?: string;
  initialEditOrderId?: string;
  initialShippingAddress?: Partial<Address>;
  onInitialShippingAddressHandled?: () => void;
  /** Gift follow page: same card, no edit / cancel / invoice / rebuy. */
  readOnly?: boolean;
  /** Hide totals and payment. */
  hideMoney?: boolean;
  /** Hide unit/line prices (gift receiver with hidden prices). */
  hideLinePrices?: boolean;
  statusLabelOverride?: string;
  hideDate?: boolean;
}

export function OrdersList({
  orders,
  emptyMessage,
  scope,
  listTestId,
  initialEditOrderId,
  initialShippingAddress,
  onInitialShippingAddressHandled,
  readOnly = false,
  hideMoney = false,
  hideLinePrices,
  statusLabelOverride,
  hideDate = false,
}: OrdersListProps) {
  const { t, lang } = useLang();
  const resolvedListTestId = listTestId ?? (scope === 'active' ? 'orders-list' : 'orders-history-list');

  if (orders.length === 0) {
    return (
      <p className={styles.empty} data-testid={resolvedListTestId}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className={styles.list} data-testid={resolvedListTestId}>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          scope={scope}
          t={t}
          lang={lang}
          readOnly={readOnly}
          hideMoney={hideMoney}
          hideLinePrices={hideLinePrices ?? hideMoney}
          {...(statusLabelOverride ? { statusLabelOverride } : {})}
          hideDate={hideDate}
          {...(initialEditOrderId ? { initialEditOrderId } : {})}
          {...(initialShippingAddress ? { initialShippingAddress } : {})}
          {...(onInitialShippingAddressHandled ? { onInitialShippingAddressHandled } : {})}
        />
      ))}
    </ul>
  );
}

const BEFORE_TO_SEND: Order['status'][] = ['confirmed', 'in_preparation'];
const TRACKABLE: Order['status'][] = ['to_send', 'sent', 'disponible'];

function OrderCard({
  order,
  scope,
  t,
  lang,
  initialEditOrderId,
  initialShippingAddress,
  onInitialShippingAddressHandled,
  readOnly = false,
  hideMoney = false,
  hideLinePrices = false,
  statusLabelOverride,
  hideDate = false,
}: {
  order: Order;
  scope: 'active' | 'history';
  t: ReturnType<typeof useLang>['t'];
  lang: ReturnType<typeof useLang>['lang'];
  initialEditOrderId?: string;
  initialShippingAddress?: Partial<Address>;
  onInitialShippingAddressHandled?: () => void;
  readOnly?: boolean;
  hideMoney?: boolean;
  hideLinePrices?: boolean;
  statusLabelOverride?: string;
  hideDate?: boolean;
}) {
  const { carts, cartLimit } = useCartData();
  const { rebuyOrder } = useCartCommands();
  const navigate = useNavigate();
  const { refreshOrders, cancelOrder, commitCanceledOrder } = useOrders();
  const [tracking, setTracking] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingShippingAddress, setPendingShippingAddress] = useState<Partial<Address> | undefined>();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /** Held until the customer continues: no timed redirect (RGAA 13.1). */
  const [cancelledOrder, setCancelledOrder] = useState<Order | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [rebuyOpen, setRebuyOpen] = useState(false);

  // The Mondial Relay picker returns through router state. React may render
  // the order list once before refreshed route data reaches this card, so do
  // not rely solely on useState's first value to restore the nested modal.
  useEffect(() => {
    if (initialEditOrderId === order.id && initialShippingAddress) {
      setPendingShippingAddress(initialShippingAddress);
      setEditOpen(true);
    }
  }, [initialEditOrderId, initialShippingAddress, order.id]);

  const canEditAddresses = !readOnly && scope === 'active' && BEFORE_TO_SEND.includes(order.status);
  const canCancel =
    !readOnly &&
    scope === 'active' &&
    ((order.status === 'confirmed' && order.paymentCaptureStatus === 'authorized') ||
      ((order.status === 'confirmed' || order.status === 'in_preparation') &&
        order.paymentCaptureStatus === 'not_required' &&
        order.total === 0));
  const canViewRevisions = !readOnly && order.revisionCount > 0;
  const canTrack =
    !readOnly && scope === 'active' && TRACKABLE.includes(order.status) && order.trackingAvailable;
  const canOpenInvoice = !readOnly && scope === 'history' && order.status !== 'cancelled';
  // A composed set has no productId of its own — the parent line is the
  // snapshot, so an order made only of compositions is still rebuyable.
  const canRebuy =
    !readOnly &&
    scope === 'history' &&
    (order.status === 'received' || order.status === 'cancelled') &&
    order.items.some((item) => item.productId || item.productType === 'composition');
  const methodLine = paymentMethodLabel(order, t);
  const itemCounts = orderPaidAndGiftQuantities(order.items);

  const rebuyItems = order.items
    .filter((item): item is typeof item & { productId: string } => !!item.productId)
    .map((item) => ({
      productId: item.productId,
      shapeKey: item.shapeKey,
      size: item.size,
      quantity: item.quantity,
      display: { title: item.title, photo: item.photo, price: item.unitPrice },
    }));
  const firstComposition = order.items.find((item) => item.productType === 'composition');
  const firstCompositionNail = firstComposition?.nails?.[0];
  const rebuyDisplayFallback = firstComposition
    ? {
        title: firstComposition.title || t.galleryNail.compositionTitle,
        photo: firstCompositionNail?.photo ?? firstComposition.photo,
        price: firstComposition.unitPrice,
      }
    : null;

  function handleRebuyConfirm(mode: 'new' | 'merge', targetCartId?: string, name?: string) {
    return rebuyOrder(order.id, rebuyItems, mode, targetCartId, name, rebuyDisplayFallback);
  }

  return (
    <li className={styles.order} data-testid="orders-item" data-order-number={order.orderNumber}>
      <div className={styles.orderHead}>
        <div className={styles.orderMeta}>
          <div className={styles.orderNumberRow}>
            <span className={styles.orderNumberLabel}>{t.ordersPage.orderNumberLabel}</span>
            <span className={styles.orderNumber} data-testid="orders-item-number">
              {order.orderNumber}
            </span>
          </div>
          {!hideDate && (
            <div className={styles.orderDateRow}>
              <span className={styles.orderDateLabel}>{t.ordersPage.orderDateLabel}</span>
              <span>{formatOrderDate(order.confirmedAt, lang)}</span>
            </div>
          )}
        </div>
        {order.status !== 'need_review' && (
          <span
            className={[styles.statusBadge, styles[`status-${order.status}`]].join(' ')}
            data-testid="orders-item-status"
            data-order-status={order.status}
          >
            {statusLabelOverride ?? statusLabel(order.status, t)}
          </span>
        )}
      </div>

      <dl className={styles.orderDetails}>
        <div className={styles.deliveryAddress}>
          <dt className={styles.addressDt}>
            <span>{t.ordersPage.deliveryAddressLabel}</span>
            {canEditAddresses && (
              <button
                type="button"
                className={styles.addressEditButton}
                aria-label={t.ordersPage.editOrderAddressesTitle}
                onClick={() => setEditOpen(true)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M9.4 1.6 12.4 4.6 4.5 12.5H1.5V9.5L9.4 1.6Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </dt>
          <dd>
            {order.companyName && (
              <>
                {order.companyName}
                <br />
              </>
            )}
            {order.recipientName && (
              <>
                {order.recipientName}
                <br />
              </>
            )}
            {/* Relay orders are snapshotted with the point's own name — it
                heads the address, the same way it does in the address book. */}
            {order.pickupPoint?.name && (
              <>
                <span className={styles.orderPickupPoint}>{order.pickupPoint.name}</span>
                <br />
              </>
            )}
            {order.line1}
            {order.line2 && (
              <>
                <br />
                {order.line2}
              </>
            )}
            <br />
            {order.postalCode} {order.city}
            <br />
            <span className={styles.orderCountry}>
              {toFlagEmoji(order.countryCode) && (
                <span aria-hidden="true">{toFlagEmoji(order.countryCode)}</span>
              )}{' '}
              {order.countryCode}
            </span>
            {order.deliveryNotes && (
              <>
                <br />
                {order.deliveryNotes}
              </>
            )}
          </dd>
        </div>
        {!order.billingSameAsShipping && (
          <div className={styles.deliveryAddress}>
            <dt className={styles.addressDt}>
              <span>{t.ordersPage.billingAddressLabel}</span>
              {canEditAddresses && (
                <button
                  type="button"
                  className={styles.addressEditButton}
                  aria-label={t.ordersPage.editOrderAddressesTitle}
                  onClick={() => setEditOpen(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M9.4 1.6 12.4 4.6 4.5 12.5H1.5V9.5L9.4 1.6Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </dt>
            <dd>
              {order.billingCompanyName && (
                <>
                  {order.billingCompanyName}
                  <br />
                </>
              )}
              {order.billingRecipientName && (
                <>
                  {order.billingRecipientName}
                  <br />
                </>
              )}
              {order.billingLine1}
              {order.billingLine2 && (
                <>
                  <br />
                  {order.billingLine2}
                </>
              )}
              <br />
              {order.billingPostalCode} {order.billingCity}
              <br />
              <span className={styles.orderCountry}>
                {toFlagEmoji(order.billingCountryCode) && (
                  <span aria-hidden="true">{toFlagEmoji(order.billingCountryCode)}</span>
                )}{' '}
                {order.billingCountryCode}
              </span>
            </dd>
          </div>
        )}
      </dl>

      <ul className={styles.itemList}>
        <OrderItemSections
          items={order.items}
          t={t}
          lang={lang}
          hideMoney={hideLinePrices}
          renderGroup={(group) => (
            <OrderItemGroup key={group.key} group={group} t={t} hideMoney={hideLinePrices} />
          )}
        />
      </ul>

      {!hideMoney && (
        <div className={styles.orderFoot}>
          <section
            className={`${styles.footSection} ${styles.footTotals}`}
            aria-label={t.ordersPage.totalLabel}
          >
            <div className={styles.orderTotals}>
              <div className={styles.shippingRow}>
                <span>{t.cart.subtotalLabel}</span>
                <span>{formatPrice(order.items.reduce((sum, item) => sum + item.lineTotal, 0))}</span>
              </div>
              <div className={styles.shippingRow}>
                <span>
                  {t.ordersPage.shippingLabel}
                  {' - '}
                  {[order.courierName ?? order.courierCode, order.express ? t.ordersPage.expressLabel : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className={cartStyles.shippingFeeValue}>
                  {order.shippingListFee != null && order.shippingListFee > 0 && order.shippingFee === 0 ? (
                    <>
                      <span className={cartStyles.priceStruck}>{formatPrice(order.shippingListFee)}</span>
                      <span className={cartStyles.shippingFreeLabel}>{t.cart.rulesFreePrice}</span>
                    </>
                  ) : (
                    formatPrice(order.shippingFee)
                  )}
                </span>
              </div>
              {(order.rulesItemDiscount ?? 0) > 0 && (
                <div className={styles.discountRow}>
                  <span>{t.cart.rulesTierDiscountLabel}</span>
                  <span>−{formatPrice(order.rulesItemDiscount ?? 0)}</span>
                </div>
              )}
              {order.voucherCode && (
                <div className={styles.discountRow}>
                  <span>
                    {t.cart.promoCodePlaceholder} - {order.voucherCode}
                  </span>
                  <span>−{formatPrice(order.voucherDiscount ?? 0)}</span>
                </div>
              )}
              {(order.loyaltyCredit ?? 0) > 0 && (
                <div className={styles.discountRow}>
                  <span>{t.loyalty.orderCreditLabel}</span>
                  <span>−{formatPrice(order.loyaltyCredit ?? 0)}</span>
                </div>
              )}
              <span className={styles.orderTotal}>
                {t.ordersPage.totalLabel}: {formatPrice(order.total)}
              </span>
            </div>
            {order.integrityToken && (
              <p className={styles.integrityNote}>
                <span>
                  {order.revisionCount > 0
                    ? t.ordersPage.revisionsIntegrityLabel.replace('{n}', String(order.revisionCount))
                    : t.ordersPage.integrityNoteLabel}
                </span>{' '}
                <span className={styles.integrityToken}>{order.integrityToken}</span>
              </p>
            )}
          </section>

          <section
            className={`${styles.footSection} ${styles.footPayment}`}
            aria-label={t.ordersPage.paymentSectionTitle}
          >
            <h3 className={styles.footSectionTitle}>{t.ordersPage.paymentSectionTitle}</h3>
            <p
              className={[
                styles.paymentCaptureNote,
                order.paymentCaptureStatus === 'authorized' ? styles.paymentCapturePending : '',
                order.paymentCaptureStatus === 'captured' || order.paymentCaptureStatus === 'not_required'
                  ? styles.paymentCaptureDone
                  : '',
                order.paymentCaptureStatus === 'canceled' || order.paymentCaptureStatus === 'expired'
                  ? styles.paymentCaptureCanceled
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {paymentCaptureLabel(order.paymentCaptureStatus, t)}
            </p>
            {methodLine && <p className={styles.paymentMethodNote}>{methodLine}</p>}
          </section>

          <section className={styles.orderActions}>
            {(order.loyaltyEarn ?? 0) > 0 && (
              <p className={styles.loyaltyEarnNote} role="note">
                {order.loyaltyEarnStatus === 'granted'
                  ? t.loyalty.orderEarnGrantedPrefix
                  : t.loyalty.orderEarnPendingPrefix}{' '}
                <strong className={styles.loyaltyEarnAmount}>{formatPrice(order.loyaltyEarn ?? 0)}</strong>{' '}
                {order.loyaltyEarnStatus === 'granted'
                  ? t.loyalty.orderEarnGrantedSuffix
                  : t.loyalty.orderEarnPendingSuffix}
              </p>
            )}
            {order.gift?.receiverName?.trim() ? (
              <GiftOrderNote name={order.gift.receiverName.trim()} className={styles.giftNote} />
            ) : null}
            {canTrack && (
              <button type="button" className={styles.trackPackageLink} onClick={() => setTracking(true)}>
                {t.ordersPage.trackPackageButton}
              </button>
            )}
            {canCancel && (
              <Button
                variant="ghostDanger"
                type="button"
                data-testid="orders-cancel"
                onClick={() => {
                  setCancelError(null);
                  setCancelOpen(true);
                }}
              >
                {t.ordersPage.cancelOrderButton}
              </Button>
            )}
            {canViewRevisions && (
              <Button variant="ghost" type="button" onClick={() => setRevisionsOpen(true)}>
                {t.ordersPage.revisionsButton.replace('{n}', String(order.revisionCount))}
              </Button>
            )}
            {canOpenInvoice && (
              <Button variant="ghost" type="button" onClick={() => setInvoiceOpen(true)}>
                {t.ordersPage.myInvoiceButton}
              </Button>
            )}
            {canRebuy && (
              <Button variant="ghost" type="button" onClick={() => setRebuyOpen(true)}>
                {t.ordersPage.rebuyButton}
              </Button>
            )}
          </section>
        </div>
      )}
      {tracking && <TrackPackageModal order={order} t={t} lang={lang} onClose={() => setTracking(false)} />}
      {invoiceOpen && <InvoiceModal order={order} t={t} onClose={() => setInvoiceOpen(false)} />}
      {cancelling && <LoadingModal message={t.ordersPage.cancelOrderLoading} />}
      {cancelledOrder && (
        <StatusModal
          message={t.ordersPage.cancelOrderSuccess}
          onClose={() => {
            commitCanceledOrder(cancelledOrder);
            navigate(localizedPath('/orders/history', lang), { replace: true }); // over the notice's entry
          }}
        />
      )}
      {editOpen && (
        <EditOrderBillingModal
          order={order}
          t={t}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            refreshOrders();
          }}
          {...(pendingShippingAddress ? { initialShippingAddress: pendingShippingAddress } : {})}
          onInitialShippingAddressHandled={() => {
            setPendingShippingAddress(undefined);
            onInitialShippingAddressHandled?.();
          }}
        />
      )}
      {cancelOpen && (
        <ConfirmModal
          variant="dialog"
          title={t.ordersPage.cancelOrderTitle}
          message={
            <>
              <p className={styles.cancelLead}>{t.ordersPage.cancelOrderConfirm}</p>
              <div className={checkoutStyles.confirmSummary}>
                <div className={checkoutStyles.confirmSummaryRow}>
                  <span className={checkoutStyles.confirmSummaryLabel}>{t.ordersPage.orderNumberLabel}</span>
                  <span className={checkoutStyles.confirmSummaryValue}>{order.orderNumber}</span>
                </div>
                <ConfirmItemsCountSummary t={t} counts={itemCounts} />
                <div className={checkoutStyles.confirmSummaryRow}>
                  <span className={checkoutStyles.confirmSummaryLabel}>{t.cart.totalLabel}</span>
                  <span className={checkoutStyles.confirmSummaryValue}>{formatPrice(order.total)}</span>
                </div>
              </div>
              <ConfirmDeliveryAddressPreview
                t={t}
                address={{
                  companyName: order.companyName,
                  recipientName: order.recipientName,
                  pickupPointName: order.pickupPoint?.name?.trim() || null,
                  line1: order.line1,
                  line2: order.line2,
                  postalCode: order.postalCode,
                  city: order.city,
                  countryCode: order.countryCode,
                }}
              />
              {cancelError && (
                <p className={styles.cancelError} role="alert">
                  {cancelError}
                </p>
              )}
            </>
          }
          confirmLabel={t.ordersPage.cancelOrderConfirmButton}
          closeLabel={t.auth.closeAria}
          confirmDanger
          onConfirm={() => {
            if (cancelling) return;
            setCancelOpen(false);
            setCancelling(true);
            setCancelError(null);
            void cancelOrder(order.id)
              .then((cancelled) => {
                setCancelling(false);
                setCancelledOrder(cancelled);
              })
              .catch((err) => {
                setCancelling(false);
                if (isBackendUnavailableError(err)) return;
                setCancelError(t.ordersPage.cancelOrderError);
                setCancelOpen(true);
              });
          }}
          onCancel={() => {
            if (cancelling) return;
            setCancelOpen(false);
            setCancelError(null);
          }}
        />
      )}
      {revisionsOpen && (
        <OrderRevisionsModal order={order} t={t} lang={lang} onClose={() => setRevisionsOpen(false)} />
      )}
      {rebuyOpen && (
        <RebuyCartDialog
          carts={carts}
          cartLimit={cartLimit}
          orderNumber={order.orderNumber}
          t={t}
          lang={lang}
          onCancel={() => setRebuyOpen(false)}
          onConfirm={handleRebuyConfirm}
        />
      )}
    </li>
  );
}
