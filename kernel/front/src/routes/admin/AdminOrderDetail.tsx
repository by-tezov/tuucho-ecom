import { useState } from 'react';
import { CourierLogo } from '../../components/ui/CourierLogo';
import { CardBrandMark } from '../../components/account/CardBrandMark';
import { Lightbox } from '../../components/ui/Lightbox';
import type { AdminOrder } from '../../api/admin/orders';
import type { Courier } from '../../api/account';
import { useLang } from '../../assets/i18n';
import { formatPrice } from '../../utils/formatPrice';
import styles from '../AdminOrdersPage.module.css';
import { OrderOriginBadge, groupedItems, STATUS_TONE, statusLabel } from './adminOrdersFilters';
import { ReturnReviewPanel } from './AdminOrderReturnReview';
import { CORE_FRONT_SLOTS, PluginOrderLines, PluginSlot } from '../../plugins/PluginHost';
import { OrderItemComment } from '../../components/orders/OrderItemComment';
import { useAdminStrings } from '../../assets/i18n/admin';

/** Status moves that open a confirmation sheet before they run. */
export type OrderAction = 'prepare' | 'release' | 'ship' | 'received' | 'return';

export function OrderDetail({
  order,
  t,
  couriers,
  acting,
  trackingUrl,
  notice,
  actionError,
  onAction,
  onVerify,
  onResolveNeedReview,
  onReturnCompleted,
  onRetryReturnEmail,
  onDownload,
  onTracking,
}: {
  order: AdminOrder;
  t: ReturnType<typeof useLang>['t'];
  couriers: Courier[];
  acting: boolean;
  trackingUrl: string | null;
  notice: string | null;
  actionError: string | null;
  onAction: (action: OrderAction) => void;
  onVerify: () => void;
  onResolveNeedReview: (resolution: 'continue' | 'cancel') => void;
  onReturnCompleted: () => void;
  onRetryReturnEmail: () => void;
  onDownload: () => void;
  onTracking: () => void;
}) {
  const a = useAdminStrings();
  const courier = order.courierName ? couriers.find((c) => c.name === order.courierName) : undefined;
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const showSticker = ['to_send', 'sent', 'disponible', 'received', 'return_review'].includes(order.status);
  const showTracking = ['to_send', 'sent', 'disponible', 'received', 'return_review'].includes(order.status);
  const canVerify = (order.status === 'received' || order.status === 'cancelled') && !order.adminVerified;
  const daysSinceSent = order.sentAt
    ? Math.max(0, Math.floor((Date.now() - new Date(order.sentAt).getTime()) / 86_400_000))
    : null;
  const daysAtRelayPoint =
    order.status === 'disponible'
      ? Math.max(0, Math.floor((Date.now() - new Date(order.statusUpdatedAt).getTime()) / 86_400_000))
      : null;
  const identity = order.companyName ?? order.recipientName;
  const extraLines = order.items.filter(
    (item) => item.origin === 'user' && Array.isArray(item.nails) && item.nails.length > 0,
  );
  const creations = order.items.filter(
    (item) => item.origin === 'user' && item.productType === 'nail' && !(item.nails && item.nails.length > 0),
  );
  const accessories = order.items.filter(
    (item) => item.origin === 'user' && item.productType === 'accessory',
  );
  const gifts = order.items.filter((item) => item.origin === 'rule');

  const confirmedAt = new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(order.confirmedAt),
  );
  const isForwardable =
    order.status === 'confirmed' ||
    order.status === 'in_preparation' ||
    order.status === 'to_send' ||
    order.status === 'sent' ||
    order.status === 'disponible' ||
    order.status === 'need_review';
  const showActionBar = isForwardable || order.returnReview?.emailStatus === 'failed' || canVerify;

  return (
    <article className={styles.detail}>
      <header className={styles.detailHeader}>
        <div className={styles.detailHeaderTop}>
          <h2>{order.orderNumber}</h2>
          <strong className={styles.detailTotal}>{formatPrice(order.total)}</strong>
        </div>
        <div className={styles.detailHeaderMeta}>
          <span className={`${styles.statusBadge} ${STATUS_TONE[order.status]}`}>
            {statusLabel(order.status, t)}
          </span>
          <OrderOriginBadge placedAsGuest={order.placedAsGuest} t={t} />
          {(order.status === 'received' || order.status === 'cancelled') && order.adminVerified && (
            <span className={styles.verifiedLabel}>{t.admin.orderVerified}</span>
          )}
          <span className={styles.detailDate}>{confirmedAt}</span>
        </div>
      </header>
      <PluginSlot name={CORE_FRONT_SLOTS.orderDetail} />
      {order.status === 'need_review' && (
        <section className={styles.needReviewAlert} aria-labelledby="admin-need-review-order-h">
          <h3 id="admin-need-review-order-h">{t.admin.needReviewOrderTitle}</h3>
          <p>
            <strong>{t.admin.needReviewOrderReason}:</strong> {order.statusReason ?? '-'}
          </p>
          <p>
            <strong>{t.admin.needReviewOrderStripeReference}:</strong>{' '}
            <code>{order.stripePaymentIntentId ?? '-'}</code>
          </p>
          <p>{t.admin.needReviewOrderWarning}</p>
          {order.needReviewBlocked && (
            <p className={styles.needReviewBlocked}>{t.admin.needReviewOrderBlocked}</p>
          )}
        </section>
      )}
      {order.status === 'return_review' && order.returnReview && (
        <ReturnReviewPanel key={order.id} order={order} onCompleted={onReturnCompleted} />
      )}
      {notice && (
        <p className={acting ? styles.loadingNotice : styles.successNotice} role="status">
          {notice}
        </p>
      )}
      {order.returnReview?.emailStatus === 'failed' && (
        <p className={styles.error}>{t.admin.returnReviewEmailFailed}</p>
      )}
      {actionError && (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      )}
      <div className={styles.detailGrid}>
        <section className={styles.detailCard}>
          <h3>{t.admin.items}</h3>
          {extraLines.length > 0 && (
            <div className={styles.itemSection}>
              <h4>{a.orders.customSets}</h4>
              <ul className={styles.itemCards}>
                <PluginOrderLines items={extraLines} hideMoney={false} />
              </ul>
            </div>
          )}
          {creations.length > 0 && (
            <ItemSection
              title={t.admin.creations}
              groups={groupedItems(creations)}
              t={t}
              onPreview={setPreviewSrc}
            />
          )}
          {accessories.length > 0 && (
            <ItemSection
              title={t.admin.accessories}
              groups={groupedItems(accessories)}
              t={t}
              onPreview={setPreviewSrc}
            />
          )}
          {gifts.length > 0 && (
            <ItemSection
              title={t.admin.gifts}
              groups={groupedItems(gifts)}
              t={t}
              gift
              onPreview={setPreviewSrc}
            />
          )}
        </section>

        <div className={styles.detailSide}>
          <section className={styles.detailCard}>
            <h3>{t.admin.information}</h3>
            <dl className={styles.facts}>
              <div>
                <dt>{t.admin.customerEmail}</dt>
                <dd>{order.userEmail ? <a href={`mailto:${order.userEmail}`}>{order.userEmail}</a> : '-'}</dd>
              </div>
              {order.giftReceiverEmail != null || order.giftGiverEmail != null ? (
                <div>
                  <dt>{t.admin.giftReceiverEmail}</dt>
                  <dd>
                    {order.giftReceiverEmail ? (
                      <a href={`mailto:${order.giftReceiverEmail}`}>{order.giftReceiverEmail}</a>
                    ) : (
                      '-'
                    )}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>{t.account.phoneLabel}</dt>
                <dd>
                  {order.phone ? <a href={`tel:${order.phone.replace(/\s+/g, '')}`}>{order.phone}</a> : '-'}
                </dd>
              </div>
              <div>
                <dt>{t.ordersPage.integrityNoteLabel.replace(/\s*:\s*$/, '')}</dt>
                <dd className={styles.mono}>{order.integrityToken ?? '-'}</dd>
              </div>
            </dl>
          </section>
          <section className={styles.detailCard}>
            <h3>{t.admin.delivery}</h3>
            <p>
              {identity && (
                <>
                  {identity}
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
              {order.countryCode}
            </p>
            {order.courierName && (
              <div className={styles.courierRow}>
                {courier && <CourierLogo courier={courier} className={styles.courierLogo} />}
                <span>{order.courierName}</span>
              </div>
            )}
          </section>
          <section className={styles.detailCard}>
            <h3>{t.admin.parcel}</h3>
            {order.packet ? (
              <p>
                {t.admin.packetWeight}: {order.packet.weight} · {t.admin.packetLength}:{' '}
                {order.packet.size.length} · {t.admin.packetWidth}: {order.packet.size.width} ·{' '}
                {t.admin.packetDepth}: {order.packet.size.depth}
              </p>
            ) : (
              <p>{t.admin.parcelUnavailable}</p>
            )}
            {daysSinceSent != null && (
              <p className={styles.customerEmail}>{t.admin.daysSinceSent(daysSinceSent)}</p>
            )}
            {daysAtRelayPoint != null && (
              <p className={styles.customerEmail}>{t.admin.daysAtRelayPoint(daysAtRelayPoint)}</p>
            )}
            {order.shipmentNumber && (
              <p className={styles.trackingNumber}>
                {t.admin.tracking}: {order.shipmentNumber}
              </p>
            )}
            {(showSticker || showTracking) && (
              <div className={styles.cardActions}>
                {showSticker && (
                  <button type="button" className={styles.cardAction} onClick={onDownload} disabled={acting}>
                    {t.admin.downloadSticker}
                  </button>
                )}
                {showTracking &&
                  (trackingUrl ? (
                    <a className={styles.cardAction} href={trackingUrl} target="_blank" rel="noreferrer">
                      {t.admin.tracking}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={styles.cardAction}
                      onClick={onTracking}
                      disabled={acting}
                    >
                      {t.admin.tracking}
                    </button>
                  ))}
              </div>
            )}
          </section>
          <section className={styles.detailCard}>
            <h3>{t.admin.payment}</h3>
            <p>
              {order.paymentCaptureStatus === 'authorized'
                ? t.admin.paymentAuthorized
                : order.paymentCaptureStatus === 'captured'
                  ? t.admin.paymentCaptured
                  : order.paymentCaptureStatus}
            </p>
            {order.paymentMethod && order.paymentMethod.type !== 'free' && (
              <div className={styles.paymentRow}>
                {order.paymentMethod.type === 'card' && order.paymentMethod.brand ? (
                  <>
                    <CardBrandMark brand={order.paymentMethod.brand} />
                    {order.paymentMethod.last4 && <span>•••• {order.paymentMethod.last4}</span>}
                  </>
                ) : order.paymentMethod.type === 'bancontact' ? (
                  <span>{t.ordersPage.paymentMethodBancontactLabel}</span>
                ) : (
                  <span>{t.ordersPage.paymentMethodPaypalLabel}</span>
                )}
              </div>
            )}
          </section>
          <section className={styles.detailCard}>
            <h3>{t.ordersPage.totalLabel}</h3>
            <dl className={styles.amounts}>
              {(order.shippingFee ?? 0) > 0 || (order.shippingListFee ?? 0) > 0 ? (
                <div>
                  <dt>{t.ordersPage.shippingLabel}</dt>
                  <dd>{formatPrice(order.shippingFee ?? 0)}</dd>
                </div>
              ) : null}
              {(order.rulesItemDiscount ?? 0) > 0 && (
                <div>
                  <dt>{t.cart.rulesTierDiscountLabel}</dt>
                  <dd>−{formatPrice(order.rulesItemDiscount ?? 0)}</dd>
                </div>
              )}
              {order.voucherCode && (order.voucherDiscount ?? 0) > 0 && (
                <div>
                  <dt>{order.voucherCode}</dt>
                  <dd>−{formatPrice(order.voucherDiscount ?? 0)}</dd>
                </div>
              )}
              {(order.loyaltyCredit ?? 0) > 0 && (
                <div>
                  <dt>{t.admin.loyaltyOrderCreditLabel}</dt>
                  <dd>−{formatPrice(order.loyaltyCredit ?? 0)}</dd>
                </div>
              )}
              {(order.loyaltyEarn ?? 0) > 0 && (
                <div>
                  <dt>
                    {t.admin.loyaltyOrderEarnLabel} (
                    {order.loyaltyEarnStatus === 'granted'
                      ? t.admin.loyaltyOrderEarnGranted
                      : order.loyaltyEarnStatus === 'void'
                        ? t.admin.loyaltyOrderEarnVoid
                        : t.admin.loyaltyOrderEarnPending}
                    )
                  </dt>
                  <dd>+{formatPrice(order.loyaltyEarn ?? 0)}</dd>
                </div>
              )}
              <div className={styles.amountTotal}>
                <dt>{t.ordersPage.totalLabel}</dt>
                <dd>{formatPrice(order.total)}</dd>
              </div>
            </dl>
            {order.status === 'received' &&
              !order.adminVerified &&
              (order.loyaltyEarn ?? 0) > 0 &&
              order.loyaltyEarnStatus === 'pending' && (
                <p className={styles.customerEmail}>{t.admin.loyaltyOrderEarnOnVerify}</p>
              )}
          </section>
        </div>
      </div>

      {showActionBar && (
        <div className={styles.actionBar}>
          {order.status === 'confirmed' && (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onAction('prepare')}
              disabled={acting}
            >
              {t.admin.prepareOrder}
            </button>
          )}
          {order.status === 'in_preparation' && (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onAction('release')}
              disabled={acting}
            >
              {t.admin.sendOrder}
            </button>
          )}
          {order.status === 'to_send' && (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onAction('ship')}
              disabled={acting}
            >
              {a.orders.markSent}
            </button>
          )}
          {(order.status === 'sent' || order.status === 'disponible') && (
            <>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onAction('received')}
                disabled={acting}
              >
                {a.orders.markReceived}
              </button>
              <button
                type="button"
                className={styles.dangerAction}
                onClick={() => onAction('return')}
                disabled={acting}
              >
                {a.orders.openReturn}
              </button>
            </>
          )}
          {order.status === 'need_review' && (
            <>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onResolveNeedReview('continue')}
                disabled={acting || order.needReviewBlocked}
              >
                {t.admin.needReviewOrderContinue}
              </button>
              <button
                type="button"
                className={styles.dangerAction}
                onClick={() => onResolveNeedReview('cancel')}
                disabled={acting}
              >
                {t.admin.needReviewOrderCancel}
              </button>
            </>
          )}
          {order.returnReview?.emailStatus === 'failed' && (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={onRetryReturnEmail}
              disabled={acting}
            >
              {t.admin.returnReviewRetryEmail}
            </button>
          )}
          {canVerify && (
            <button type="button" className={styles.primaryAction} onClick={onVerify} disabled={acting}>
              {t.admin.verifyOrder}
            </button>
          )}
        </div>
      )}

      {previewSrc && (
        <Lightbox
          src={previewSrc}
          alt=""
          onClose={() => setPreviewSrc(null)}
          closeLabel={t.admin.closePhotoPreview}
        />
      )}
    </article>
  );
}

function ItemSection({
  title,
  groups,
  t,
  gift = false,
  onPreview,
}: {
  title: string;
  groups: AdminOrder['items'][];
  t: ReturnType<typeof useLang>['t'];
  gift?: boolean;
  onPreview: (src: string) => void;
}) {
  return (
    <div className={styles.itemSection}>
      <h4>{title}</h4>
      <ul className={styles.itemCards}>
        {groups.map((items) => {
          const first = items[0]!;
          return (
            <li
              key={items.map((item) => item.id).join(':')}
              className={gift ? `${styles.itemCard} ${styles.giftCard}` : styles.itemCard}
            >
              {first.photo ? (
                <button
                  type="button"
                  className={styles.itemPhotoButton}
                  onClick={() => onPreview(first.photo!)}
                  aria-label={t.admin.enlargeItemPhoto}
                >
                  <img
                    loading="lazy"
                    decoding="async"
                    src={first.photo}
                    alt={first.title}
                    className={styles.itemPhoto}
                  />
                </button>
              ) : (
                <div className={styles.photoMissing} aria-hidden="true" />
              )}
              <div className={styles.itemContent}>
                <div className={styles.itemTitleRow}>
                  <strong>{first.title}</strong>
                  {gift && <span className={styles.giftBadge}>{t.admin.gift}</span>}
                </div>
                <p className={styles.reference}>{first.productUid}</p>
                <div className={styles.variants}>
                  {items.map((item) => (
                    <div key={item.id} className={styles.variantRow}>
                      <span className={styles.qty}>{item.quantity} ×</span>
                      {item.productType === 'nail' && item.shapeLabel && (
                        <span className={styles.chip}>{item.shapeLabel}</span>
                      )}
                      {item.productType === 'nail' && item.lengthLabel && (
                        <span className={styles.chip}>{item.lengthLabel}</span>
                      )}
                      {item.productType === 'nail' && item.size && (
                        <span className={`${styles.chip} ${styles.sizeChip}`}>{item.size}</span>
                      )}
                      {item.productType === 'accessory' && item.packLabel && (
                        <span className={styles.chip}>{item.packLabel}</span>
                      )}
                      <span className={gift ? styles.free : undefined}>
                        {gift ? '-' : formatPrice(item.lineTotal)}
                      </span>
                    </div>
                  ))}
                </div>
                <OrderItemComment
                  t={t}
                  comment={items.find((item) => item.comment)?.comment}
                  label={t.admin.itemComment}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
