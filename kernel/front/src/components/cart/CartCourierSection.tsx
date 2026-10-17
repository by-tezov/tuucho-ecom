import { useMemo } from 'react';
import type { Courier } from '../../api/account';
import type { Strings } from '../../assets/i18n/types';
import {
  previewFreeShipping,
  type FreeShippingPreview,
  type PublicCartRule,
} from '../../utils/cartRulesPreview';
import { formatPrice } from '../../utils/formatPrice';
import { pickCourierTier, resolvePacketPrice } from '../../utils/courierPricing';
import { checkoutChoicePlacement, courierOverflowTier } from '../../utils/checkoutOverflow';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { CourierLogo } from '../ui/CourierLogo';
import { CartFreeShippingProgress } from './CartFreeShippingProgress';
import { CheckoutOverflowMoreLink } from '../checkout/CheckoutOverflowMoreLink';
import type { CheckoutOverflowPickerOption } from '../checkout/CheckoutOverflowPickerModal';
import featureStyles from './CartFeature.module.css';
import sectionStyles from './CartCourierSection.module.css';

const styles = { ...featureStyles, ...sectionStyles };
export const PENDING_SHIPPING_PRICE = '?? €';

interface CartCourierSectionProps {
  t: Strings;
  couriers: Courier[];
  disabledCourierCodes: readonly string[];
  effectiveCountries: readonly string[];
  promotedCourierCodes: ReadonlySet<string>;
  selectedCourierCode: string | null;
  defaultCourierCode: string | null;
  /** Customer-added nail-set count used to pick the packet tier. Accessories are 0. */
  totalQuantity: number;
  shippingCountryCode: string | undefined;
  express: boolean;
  cartRules: PublicCartRule[];
  francoMerchandise: number;
  freeShipping: FreeShippingPreview | null;
  noCourierFits: boolean;
  blockNotice: string | null;
  hidePrices?: boolean;
  onOpenOverflowModal: () => void;
  onSelectCourier: (code: string) => void;
  onExpressChange: (express: boolean) => void;
}

function courierTier(
  courier: Courier,
  disabledCourierCodes: readonly string[],
  effectiveCountries: readonly string[],
) {
  return courierOverflowTier(
    disabledCourierCodes.includes(courier.code),
    courier.countries,
    effectiveCountries,
  );
}

function visibleCourier(
  courier: Courier,
  disabledCourierCodes: readonly string[],
  effectiveCountries: readonly string[],
  promotedCourierCodes: ReadonlySet<string>,
) {
  const tier = courierTier(courier, disabledCourierCodes, effectiveCountries);
  return checkoutChoicePlacement(tier, promotedCourierCodes.has(courier.code)) === 'list';
}

export function buildCourierOverflowOptions(
  couriers: Courier[],
  disabledCourierCodes: readonly string[],
  effectiveCountries: readonly string[],
  promotedCourierCodes: ReadonlySet<string>,
): CheckoutOverflowPickerOption[] {
  return couriers
    .filter(
      (c) =>
        checkoutChoicePlacement(
          courierTier(c, disabledCourierCodes, effectiveCountries),
          promotedCourierCodes.has(c.code),
        ) === 'overflow',
    )
    .map((courier) => ({
      id: courier.code,
      label: courier.name,
      ...(courier.description ? { description: courier.description } : {}),
      leading: <CourierLogo courier={courier} className={styles.courierBadge} decorative />,
    }));
}

/** Delivery-method presentation and packet-price preview. Checkout remains
 * server-authoritative; this component only mirrors the current quote. */
export function CartCourierSection({
  t,
  couriers,
  disabledCourierCodes,
  effectiveCountries,
  promotedCourierCodes,
  selectedCourierCode,
  defaultCourierCode,
  totalQuantity,
  shippingCountryCode,
  express,
  cartRules,
  francoMerchandise,
  freeShipping,
  noCourierFits,
  blockNotice,
  hidePrices = false,
  onOpenOverflowModal,
  onSelectCourier,
  onExpressChange,
}: CartCourierSectionProps) {
  const listedCouriers = couriers.filter((c) =>
    visibleCourier(c, disabledCourierCodes, effectiveCountries, promotedCourierCodes),
  );
  const overflowOptions = useMemo(
    () =>
      buildCourierOverflowOptions(couriers, disabledCourierCodes, effectiveCountries, promotedCourierCodes),
    [couriers, disabledCourierCodes, effectiveCountries, promotedCourierCodes],
  );
  const showOverflowLink = overflowOptions.length > 0;

  function renderCourier(courier: Courier) {
    const tier = pickCourierTier(courier, totalQuantity);
    const disabled = tier == null;
    const isSelected = selectedCourierCode === courier.code;
    const listPrice = hidePrices || !tier?.price ? null : resolvePacketPrice(tier.price, shippingCountryCode);
    const expressPrice =
      hidePrices || tier?.expressPrice == null
        ? null
        : resolvePacketPrice(tier.expressPrice, shippingCountryCode);
    const showExpress =
      !hidePrices && tier?.expressPrice != null && (shippingCountryCode == null || expressPrice != null);
    const price =
      tier == null ? null : isSelected && express && expressPrice != null ? expressPrice : listPrice;
    const pricePending = !hidePrices && tier != null && price == null;
    const courierFree =
      price != null &&
      previewFreeShipping(cartRules, shippingCountryCode, francoMerchandise, price)?.applied === true;

    return (
      <div key={courier.code}>
        <label
          className={
            disabled
              ? `${styles.courierOption} ${styles.courierOptionDisabled}`
              : isSelected
                ? `${styles.courierOption} ${styles.courierOptionSelected}`
                : styles.courierOption
          }
        >
          <span className={styles.courierOptionMain}>
            <input
              type="radio"
              onMouseDown={suppressMouseFocus}
              name="courier"
              data-testid="cart-courier-option"
              data-courier-code={courier.code}
              checked={isSelected}
              disabled={disabled}
              onChange={() => {
                if (!disabled) onSelectCourier(courier.code);
              }}
            />
            <CourierLogo courier={courier} className={styles.courierBadge} decorative />
            <span className={styles.courierOptionText}>
              <span className={styles.courierOptionName}>
                {courier.name}
                {defaultCourierCode === courier.code && (
                  <span className={styles.defaultBadge}>{t.address.defaultBadge}</span>
                )}
                {disabled && <span className={styles.courierReason}> ({t.cart.errorShippingOverflow})</span>}
              </span>
              {courier.description && (
                <span className={styles.courierDescription}>{courier.description}</span>
              )}
            </span>
          </span>
          {tier != null && (
            <span className={styles.courierPrice}>
              {pricePending ? (
                PENDING_SHIPPING_PRICE
              ) : price != null && courierFree ? (
                <span className={styles.shippingFeeValue}>
                  <span className={styles.priceStruck}>{formatPrice(price)}</span>
                  <span className={styles.shippingFreeLabel}>{t.cart.rulesFreePrice}</span>
                </span>
              ) : price != null ? (
                formatPrice(price)
              ) : null}
            </span>
          )}
        </label>
        {isSelected && showExpress && (
          <label className={styles.expressRow}>
            <input
              type="checkbox"
              onMouseDown={suppressMouseFocus}
              checked={express}
              onChange={(event) => onExpressChange(event.target.checked)}
            />
            {t.cart.expressLabel} ({expressPrice != null ? formatPrice(expressPrice) : PENDING_SHIPPING_PRICE}
            )
          </label>
        )}
        {isSelected && pricePending && <p className={styles.notice}>{t.cart.shippingPricePending}</p>}
      </div>
    );
  }

  return (
    <section className={styles.courierSection} aria-labelledby="cart-courier-heading">
      <div className={styles.sectionHeader}>
        <h2 id="cart-courier-heading" className={styles.sectionTitle}>
          {t.cart.shippingMethodLabel}
        </h2>
      </div>
      {listedCouriers.length > 0 && (
        // The radios' group, named by the heading (RGAA 11.5): the section
        // alone is a region, not a group of fields.
        <div className={styles.courierList} role="radiogroup" aria-labelledby="cart-courier-heading">
          {listedCouriers.map(renderCourier)}
        </div>
      )}
      {noCourierFits && <p className={styles.notice}>{t.cart.errorShippingOverflow}</p>}
      {blockNotice && <p className={styles.notice}>{blockNotice}</p>}
      {freeShipping?.threshold != null && !hidePrices && (
        <>
          <div className={styles.francoSeparator} aria-hidden="true" />
          <CartFreeShippingProgress key={freeShipping.countryCode} preview={freeShipping} t={t} />
        </>
      )}
      <CheckoutOverflowMoreLink t={t} visible={showOverflowLink} onOpen={onOpenOverflowModal} />
    </section>
  );
}
