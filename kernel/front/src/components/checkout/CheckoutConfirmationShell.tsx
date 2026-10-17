import type { OrderItem } from '../../api/orders';
import type { ConfirmItemCounts } from './checkoutContracts';
import { useLang } from '../../assets/i18n';
import type { Strings } from '../../assets/i18n/types';
import { usesSingularItemCount } from '../../utils/cartDisplayName';
import { toFlagEmoji } from '../../utils/countryFlag';
import styles from '../cart/CartCheckoutSection.module.css';

/** Same split as OrdersList's own item groups — rule or locked lines are
 * gifts, a plugin extra-set (child units on `nails`) is its own kind, then a
 * shapeKey (frozen at confirm, empty for accessories) tells catalogue sets
 * from accessories. */
export function orderPaidAndGiftQuantities(items: OrderItem[]): ConfirmItemCounts {
  const counts: ConfirmItemCounts = { nailQty: 0, extraQty: 0, accessoryQty: 0, giftQty: 0 };
  for (const item of items) {
    const isGift = item.origin === 'rule' || item.locked === true;
    if (isGift) counts.giftQty += item.quantity;
    else if (item.nails && item.nails.length > 0) counts.extraQty += item.quantity;
    else if (item.shapeKey) counts.nailQty += item.quantity;
    else counts.accessoryQty += item.quantity;
  }
  return counts;
}

/** One row per kind actually present in the order/cart, each with its own
 * singular/plural label (t.ordersPage's itemGroup* pairs, shared with
 * OrdersList's own section headers) instead of one combined "Articles"
 * count that blurred nail sets and accessories together. */
export function ConfirmItemsCountSummary({ t, counts }: { t: Strings; counts: ConfirmItemCounts }) {
  const { lang } = useLang();
  const rows: Array<[number, string, string]> = [
    [counts.nailQty, t.ordersPage.itemGroupNailsOne, t.ordersPage.itemGroupNailsOther],
    [counts.extraQty, t.ordersPage.itemGroupCustomSetsOne, t.ordersPage.itemGroupCustomSetsOther],
    [counts.accessoryQty, t.ordersPage.itemGroupAccessoriesOne, t.ordersPage.itemGroupAccessoriesOther],
    [counts.giftQty, t.ordersPage.itemGroupGiftsOne, t.ordersPage.itemGroupGiftsOther],
  ];
  return (
    <>
      {rows
        .filter(([qty]) => qty > 0)
        .map(([qty, one, other]) => (
          <div key={one} className={styles.confirmSummaryRow}>
            <span className={styles.confirmSummaryLabel}>
              {usesSingularItemCount(qty, lang) ? one : other}
            </span>
            <span className={styles.confirmSummaryValue}>{qty}</span>
          </div>
        ))}
    </>
  );
}

/** Delivery address block shared by payment confirm dialogs and the order
 * cancel modal — same fields, same layout. */
export interface ConfirmDeliveryAddressFields {
  companyName: string | null;
  recipientName: string | null;
  /** Relay/locker public name, when the address is a pickup point. */
  pickupPointName: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
}

export function ConfirmDeliveryAddressPreview({
  t,
  address,
}: {
  t: Strings;
  address: ConfirmDeliveryAddressFields | null | undefined;
}) {
  if (!address) return null;
  const flag = toFlagEmoji(address.countryCode);
  return (
    <div className={styles.confirmDeliveryAddress}>
      <span className={styles.confirmDeliveryLabel}>{t.ordersPage.deliveryAddressLabel}</span>
      <span className={styles.confirmDeliveryBody}>
        {address.companyName && (
          <>
            {address.companyName}
            <br />
          </>
        )}
        {address.recipientName && (
          <>
            {address.recipientName}
            <br />
          </>
        )}
        {address.pickupPointName && (
          <>
            <span className={styles.confirmDeliveryPickupPoint}>{address.pickupPointName}</span>
            <br />
          </>
        )}
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.postalCode} {address.city}
        <br />
        <span className={styles.confirmDeliveryCountry}>
          {flag && <span aria-hidden="true">{flag}</span>} {address.countryCode}
        </span>
      </span>
    </div>
  );
}
