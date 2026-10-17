import { useEffect, useMemo } from 'react';
import { useLang } from '../assets/i18n';
import { useAuthSession } from '../state/AuthContext';
import { useCartData } from '../hooks/useCart';
import { useGiftReceiver } from '../hooks/useGiftReceiver';
import { useCartProductPresentation } from './cart/useCartProductPresentation';
import type { GiftStatus, GiftSummary } from '../api/gift';
import type { CartComposition, CartItem } from '../api/cart';
import type { Order, OrderItem, OrderStatus } from '../api/orders';
import type { PickupPoint } from '../api/account';
import type { ProductById } from '../api/gallery';
import type { GalleryItem } from '../data/types';
import { Seo } from '../components/seo/Seo';
import { OrdersList } from '../components/orders/OrdersList';
import { accessoryLinePhoto } from '../utils/accessoryPacks';
import accountStyles from './AccountAddressesPage.module.css';
import cartStyles from './CartPage.module.css';

const ORDER_STATUSES: OrderStatus[] = [
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'received',
  'cancelled',
  'need_review',
  'return_review',
];

function isOrderStatus(value: string | null | undefined): value is OrderStatus {
  return !!value && (ORDER_STATUSES as string[]).includes(value);
}

function pickupFromDestination(destination: GiftSummary['destination']): PickupPoint | null {
  if (!destination?.pickupPoints) return null;
  const first = Object.values(destination.pickupPoints)[0];
  if (!first || typeof first !== 'object') return null;
  const point = first as { id?: string; name?: string };
  if (!point.id) return null;
  return { id: point.id, ...(point.name ? { name: point.name } : {}) };
}

function giftCompositionsToOrderItems(
  compositions: CartComposition[] | undefined,
  hidePrices: boolean,
): OrderItem[] {
  if (!compositions?.length) return [];
  return compositions.map((composition) => {
    const unitPrice = hidePrices ? 0 : composition.unitPrice;
    return {
      id: `composition-${composition.id}`,
      productId: null,
      productUid: '',
      productType: 'composition' as const,
      title: '',
      desc: null,
      occasion: null,
      colorMain: [],
      colorSecondary: [],
      shapeKey: '',
      shapeLabel: '',
      lengthKey: '',
      lengthLabel: '',
      photo: composition.nails[0]?.photo ?? null,
      size: composition.size,
      packKey: '',
      packLabel: '',
      quantity: composition.quantity,
      unitPrice,
      lineTotal: hidePrices ? 0 : unitPrice * composition.quantity,
      origin: 'user' as const,
      nails: composition.nails.map((nail) => ({
        productId: nail.productId,
        productUid: nail.productUid,
        title: nail.title,
        shapeKey: nail.shapeKey,
        shapeLabel: nail.shapeLabel,
        lengthKey: nail.lengthKey,
        lengthLabel: nail.lengthLabel,
        finger: nail.finger,
        variationKey: nail.variationKey,
        variationLabel: nail.variationLabel,
        variationAxisLabel: nail.variationAxisLabel,
        photo: nail.photo,
        unitPrice: nail.unitPrice,
      })),
    };
  });
}

function giftLinesToOrderItems(
  items: CartItem[],
  gallerySets: Record<string, GalleryItem>,
  productsById: Record<string, ProductById>,
  hidePrices: boolean,
  priced: GiftSummary['items'],
): OrderItem[] {
  return items.map((item, index) => {
    const set = gallerySets[item.productId];
    const product = productsById[item.productId];
    const pricedLine = priced.find(
      (line) =>
        line.productId === item.productId &&
        line.shapeKey === item.shapeKey &&
        line.lengthKey === item.lengthKey &&
        line.size === item.size,
    );
    const isRule = item.origin === 'rule';
    const isAccessory = !item.shapeKey;
    const title = set?.title ?? product?.title ?? '';
    const unitPrice = hidePrices || isRule ? 0 : (pricedLine?.unitPrice ?? 0);
    const lineTotal = hidePrices || isRule ? 0 : (pricedLine?.lineTotal ?? unitPrice * item.quantity);
    const photo = isAccessory
      ? product
        ? accessoryLinePhoto(product, item.packKey ?? '')
        : null
      : (set?.photosByShapeLength[item.shapeKey]?.[item.lengthKey]?.[0]?.small ?? product?.photo ?? null);
    return {
      id: `${item.productId}-${item.shapeKey}-${item.lengthKey}-${item.size}-${index}`,
      productId: item.productId,
      productUid: set?.productUid ?? product?.productUid ?? '',
      title,
      desc: set?.desc ?? product?.desc ?? null,
      occasion: null,
      colorMain: [],
      colorSecondary: [],
      shapeKey: item.shapeKey,
      shapeLabel: set?.shape[item.shapeKey] ?? '',
      lengthKey: item.lengthKey,
      lengthLabel: '',
      photo,
      size: item.size,
      packKey: item.packKey ?? '',
      packLabel: product?.packLabels?.[item.packKey ?? ''] ?? '',
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      origin: isRule ? ('rule' as const) : ('user' as const),
      locked: isRule,
    };
  });
}

function followBadge(
  status: GiftStatus,
  orderStatus: string | null | undefined,
  t: ReturnType<typeof useLang>['t'],
): { status: OrderStatus; label?: string } {
  if (status === 'cancelled' || status === 'expired') return { status: 'cancelled' };
  if (status === 'ordered' && isOrderStatus(orderStatus)) return { status: orderStatus };
  if (status === 'paying') return { status: 'confirmed', label: t.gift.statusPaying };
  return { status: 'confirmed', label: t.gift.statusAwaitingPayment };
}

function toFollowOrder(summary: GiftSummary, items: OrderItem[], t: ReturnType<typeof useLang>['t']): Order {
  const destination = summary.destination;
  const badge = followBadge(summary.status, summary.orderStatus, t);
  const pickupPoint = pickupFromDestination(destination);
  return {
    id: summary.id,
    orderNumber: summary.orderNumber ?? t.gift.followPendingNumber,
    status: badge.status,
    recipientName: destination?.recipientName ?? null,
    companyName: destination?.companyName ?? null,
    line1: destination?.line1 ?? '',
    line2: destination?.line2 ?? null,
    deliveryNotes: destination?.deliveryNotes ?? null,
    postalCode: destination?.postalCode ?? '',
    city: destination?.city ?? '',
    countryCode: destination?.countryCode ?? '',
    phone: destination?.phone ?? null,
    addressId: null,
    networkCode: destination?.networkCodes?.[0] ?? null,
    pickupPoint,
    courierCode: destination?.courierCode ?? null,
    courierName: destination?.courierCode ?? null,
    trackingAvailable: false,
    packetKey: null,
    express: false,
    shippingFee: 0,
    voucherCode: null,
    voucherDiscount: null,
    integrityToken: null,
    revisionCount: 0,
    paymentCaptureStatus: 'not_required',
    paymentMethod: null,
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
    confirmedAt: summary.orderConfirmedAt ?? new Date().toISOString(),
    statusUpdatedAt: summary.orderConfirmedAt ?? new Date().toISOString(),
    billingSameAsShipping: true,
    billingAddressId: null,
    billingRecipientName: null,
    billingCompanyName: null,
    billingLine1: '',
    billingLine2: null,
    billingPostalCode: '',
    billingCity: '',
    billingCountryCode: '',
    billingPhone: null,
    items,
  };
}

export function GiftReceiverFollowPage() {
  const { t, lang } = useLang();
  const gift = useGiftReceiver();
  const { status, authedRequest } = useAuthSession();
  const { items } = useCartData();
  const { gallerySets, productsById } = useCartProductPresentation({
    items,
    language: lang,
    status,
    authedRequest,
  });
  const refresh = gift.refresh;

  useEffect(() => {
    const POLL_MS = 60_000;

    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);

    let timer: number | undefined;
    const clear = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const start = () => {
      clear();
      if (document.visibilityState !== 'visible') return;
      timer = window.setInterval(() => void refresh(), POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      } else {
        clear();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clear();
    };
  }, [refresh]);

  const summary = gift.summary;
  const hidePrices = gift.hidePrices;
  const orderItems = useMemo(() => {
    if (!summary) return [];
    return [
      ...giftCompositionsToOrderItems(summary.compositions, hidePrices),
      ...giftLinesToOrderItems(items, gallerySets, productsById, hidePrices, summary.items),
    ];
  }, [gallerySets, hidePrices, items, productsById, summary]);
  const badge = summary ? followBadge(summary.status, summary.orderStatus, t) : null;
  const order = useMemo(
    () => (summary ? toFollowOrder(summary, orderItems, t) : null),
    [orderItems, summary, t],
  );

  return (
    <section aria-labelledby="gift-follow-h" className={cartStyles.section} data-testid="gift-follow-page">
      <Seo title={t.gift.followTitle} description={t.gift.followSubtitle} path="/cart" noindex />
      <h1 id="gift-follow-h" className={`${accountStyles.title} ${accountStyles.hasSubtitle}`}>
        {t.gift.followTitle}
      </h1>
      <p className={accountStyles.subtitle}>{t.gift.followSubtitle}</p>
      {order && (
        <OrdersList
          orders={[order]}
          emptyMessage={t.gift.emptyBasket}
          scope="active"
          listTestId="gift-follow-order"
          readOnly
          hideMoney
          hideLinePrices={hidePrices}
          hideDate={!summary?.orderConfirmedAt}
          {...(badge?.label ? { statusLabelOverride: badge.label } : {})}
        />
      )}
    </section>
  );
}
