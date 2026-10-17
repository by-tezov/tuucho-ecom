import { useRef } from 'react';
import type { Strings } from '../../assets/i18n/types';
import { useFitOneLineTitle } from '../../hooks/useFitOneLineTitle';
import { formatPrice } from '../../utils/formatPrice';
import type { OrderShapeGroup } from '../../utils/groupOrderItems';
import { Chip } from '../ui/Chip';
import cartStyles from '../cart/CartFeature.module.css';
import commentStyles from '../cart/CartItemComment.module.css';
import { OrderItemComment } from './OrderItemComment';
import styles from './OrdersList.module.css';

/** Match CartFeature.module.css / CartLine mobile breakpoint for title fitting. */
const TITLE_FIT_MQ = '(max-width: 1023px)';

/** One set+shape card — same title fit as CartLine (scale 18→10px, then …).
 * Accessories omit empty shape/size chips. Gift lines mirror AccessoryCartLine
 * (qty × included label + OFFERT badge on the accent border). */
export function OrderItemGroup({
  group,
  t,
  hideMoney = false,
}: {
  group: OrderShapeGroup;
  t: Strings;
  hideMoney?: boolean;
}) {
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  useFitOneLineTitle(titleRef, group.title, TITLE_FIT_MQ);
  const isAccessory = !group.shapeKey;
  const isGift = group.variants.every((item) => item.origin === 'rule' || item.locked);
  const giftQuantity = group.variants.reduce((sum, item) => sum + item.quantity, 0);

  if (isGift) {
    return (
      <li className={`${styles.item} ${styles.itemGift} ${cartStyles.lineOffer}`}>
        <div className={cartStyles.photoCol}>
          {group.photo ? (
            <img
              loading="lazy"
              decoding="async"
              src={group.photo}
              alt={group.title}
              className={cartStyles.photo}
              draggable={false}
            />
          ) : (
            <div
              className={`${cartStyles.photo} ${styles.photoMissing}`}
              role="img"
              aria-label={t.ordersPage.photoMissingLabel}
            />
          )}
        </div>
        <div className={cartStyles.lineBody}>
          <div className={cartStyles.lineOfferTitleRow}>
            <div className={cartStyles.lineHeading}>
              <p ref={titleRef} className={`${cartStyles.lineTitle} ${styles.orderItemTitle}`}>
                {group.title}
              </p>
              <p className={cartStyles.itemRefUnderTitle}>
                {t.cart.referenceLabel} {group.productUid}
              </p>
            </div>
          </div>
          {group.desc ? <p className={cartStyles.lineDesc}>{group.desc}</p> : null}
        </div>
        <div className={cartStyles.giftMeta}>
          <div className={`${cartStyles.variantRow} ${cartStyles.variantRowSolo}`}>
            <span className={cartStyles.variantText}>
              <span className={cartStyles.giftQty}>{giftQuantity}</span>
              {' × '}
              {t.cart.rulesGiftIncluded}
            </span>
            <span className={cartStyles.variantPriceFree}>{t.cart.rulesFreePrice}</span>
          </div>
        </div>
        <span className={cartStyles.giftBadge}>{t.cart.rulesGiftBadge}</span>
      </li>
    );
  }

  return (
    <li className={`${styles.item} ${commentStyles.lineWithComment}`}>
      <div className={cartStyles.photoCol}>
        {group.photo ? (
          <img
            loading="lazy"
            decoding="async"
            src={group.photo}
            alt={group.title}
            className={cartStyles.photo}
            draggable={false}
          />
        ) : (
          <div
            className={`${cartStyles.photo} ${styles.photoMissing}`}
            role="img"
            aria-label={t.ordersPage.photoMissingLabel}
          />
        )}
      </div>
      <div className={cartStyles.lineBody}>
        <div className={cartStyles.lineHeading}>
          <div className={cartStyles.titlePriceRow}>
            <p ref={titleRef} className={`${cartStyles.lineTitle} ${styles.orderItemTitle}`}>
              {group.title}
            </p>
            {!hideMoney && <span className={cartStyles.lineUnitPrice}>· {formatPrice(group.unitPrice)}</span>}
          </div>
          <p className={cartStyles.itemRefUnderTitle}>
            {t.cart.referenceLabel} {group.productUid}
          </p>
          {!isAccessory && (group.shapeLabel || group.lengthLabel) ? (
            <div className={cartStyles.variantAxisRow}>
              {group.shapeLabel ? (
                <Chip className={cartStyles.variantShapeChip}>{group.shapeLabel}</Chip>
              ) : null}
              {group.shapeLabel && group.lengthLabel ? <span aria-hidden="true"> - </span> : null}
              {group.lengthLabel ? (
                <Chip className={cartStyles.variantShapeChip}>{group.lengthLabel}</Chip>
              ) : null}
            </div>
          ) : null}
          {group.desc ? (
            <p className={`${cartStyles.lineDesc} ${styles.orderItemDescDesktop}`}>{group.desc}</p>
          ) : null}
        </div>
        <div className={cartStyles.variantList}>
          {group.variants.map((item) => (
            <div
              key={item.id}
              className={
                group.variants.length === 1
                  ? `${cartStyles.variantRow} ${cartStyles.variantRowSolo}`
                  : cartStyles.variantRow
              }
            >
              <span className={cartStyles.variantText}>{item.quantity} ×</span>
              {!isAccessory && item.size !== '' && (
                <Chip className={cartStyles.variantSizeChip}>{item.size}</Chip>
              )}
              {isAccessory && item.packLabel && (
                <Chip className={cartStyles.variantPackChip}>{item.packLabel}</Chip>
              )}
              {!hideMoney && <span className={cartStyles.variantPrice}>{formatPrice(item.lineTotal)}</span>}
            </div>
          ))}
        </div>
      </div>
      <OrderItemComment t={t} comment={group.variants.find((item) => item.comment)?.comment ?? null} />
    </li>
  );
}
