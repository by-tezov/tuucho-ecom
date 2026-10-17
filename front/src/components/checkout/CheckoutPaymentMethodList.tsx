import type { PaymentMethod } from '../../api/checkout';
import type { Strings } from '../../assets/i18n/types';
import { CardBrandMark } from '../account/CardBrandMark';
import { PaymentBrandMark } from './PaymentBrandMark';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import {
  checkoutChoicePlacement,
  paymentMethodOverflowTier,
  shopMethodAllowedCountries,
  type PaymentMethodCountries,
  type PaymentOverflowKey,
} from '../../utils/checkoutOverflow';
import type { CheckoutOverflowPickerOption } from './CheckoutOverflowPickerModal';
import type { CheckoutPaymentBootstrap, WalletCheckoutMethod } from './checkoutContracts';
import styles from '../cart/CartCheckoutSection.module.css';

const BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

export type { PaymentOverflowKey } from '../../utils/checkoutOverflow';

interface CheckoutPaymentMethodListProps {
  t: Strings;
  shopPaymentMethods: CheckoutPaymentBootstrap['shopPaymentMethods'];
  paymentMethodCountries: PaymentMethodCountries;
  effectiveCountries: readonly string[];
  promotedKeys: ReadonlySet<PaymentOverflowKey>;
  walletAvailability: CheckoutPaymentBootstrap['walletAvailability'];
  googlePayEnabled: boolean;
  applePayEnabled: boolean;
  paypalEnabled: boolean;
  bancontactEnabled: boolean;
  newCardEnabled: boolean;
  googlePayIsDefault: boolean;
  applePayIsDefault: boolean;
  payPalIsDefault: boolean;
  bancontactIsDefault: boolean;
  selectedWallet: WalletCheckoutMethod | null;
  payPalSelected: boolean;
  bancontactSelected: boolean;
  newCardSelected: boolean;
  selectedCardId: string | null;
  loadingMethods: boolean;
  visibleMethods: PaymentMethod[];
  onSelectWallet: (method: WalletCheckoutMethod) => void;
  onSelectPayPal: () => void;
  onSelectBancontact: () => void;
  onSelectNewCard: () => void;
  onSelectCard: (id: string) => void;
  onDeleteCard: (id: string) => void;
}

function tierForMethod(
  shopOn: boolean,
  userOn: boolean,
  deviceOn: boolean,
  method: 'card' | 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay',
  countries: PaymentMethodCountries,
  effectiveCountries: readonly string[],
) {
  return paymentMethodOverflowTier(
    shopOn,
    userOn,
    deviceOn,
    shopMethodAllowedCountries(method, countries),
    effectiveCountries,
  );
}

function visibleInList(
  tier: 'primary' | 'overflow' | 'hidden',
  key: PaymentOverflowKey,
  promoted: ReadonlySet<PaymentOverflowKey>,
) {
  return checkoutChoicePlacement(tier, promoted.has(key)) === 'list';
}

function hiddenOverflowPaymentKeys(
  shopPaymentMethods: CheckoutPaymentBootstrap['shopPaymentMethods'],
  paymentMethodCountries: PaymentMethodCountries,
  effectiveCountries: readonly string[],
  walletAvailability: CheckoutPaymentBootstrap['walletAvailability'],
  googlePayEnabled: boolean,
  applePayEnabled: boolean,
  paypalEnabled: boolean,
  bancontactEnabled: boolean,
  newCardEnabled: boolean,
  loadingMethods: boolean,
  visibleMethods: PaymentMethod[],
  promotedKeys: ReadonlySet<PaymentOverflowKey>,
): PaymentOverflowKey[] {
  const newCardTier = tierForMethod(
    shopPaymentMethods.card,
    newCardEnabled,
    true,
    'card',
    paymentMethodCountries,
    effectiveCountries,
  );
  const rememberedCardTier = tierForMethod(
    shopPaymentMethods.card,
    true,
    true,
    'card',
    paymentMethodCountries,
    effectiveCountries,
  );
  const tiers: { key: PaymentOverflowKey; tier: ReturnType<typeof tierForMethod> }[] = [
    {
      key: 'google_pay',
      tier: tierForMethod(
        shopPaymentMethods.googlePay,
        googlePayEnabled,
        walletAvailability.googlePay,
        'google_pay',
        paymentMethodCountries,
        effectiveCountries,
      ),
    },
    {
      key: 'apple_pay',
      tier: tierForMethod(
        shopPaymentMethods.applePay,
        applePayEnabled,
        walletAvailability.applePay,
        'apple_pay',
        paymentMethodCountries,
        effectiveCountries,
      ),
    },
    {
      key: 'paypal',
      tier: tierForMethod(
        shopPaymentMethods.paypal,
        paypalEnabled,
        true,
        'paypal',
        paymentMethodCountries,
        effectiveCountries,
      ),
    },
    {
      key: 'bancontact',
      tier: tierForMethod(
        shopPaymentMethods.bancontact,
        bancontactEnabled,
        true,
        'bancontact',
        paymentMethodCountries,
        effectiveCountries,
      ),
    },
    { key: 'new_card', tier: newCardTier },
    { key: 'card', tier: rememberedCardTier },
  ];

  const hidden: PaymentOverflowKey[] = [];
  for (const { key, tier } of tiers) {
    if (checkoutChoicePlacement(tier, promotedKeys.has(key)) !== 'overflow') continue;
    if (key === 'card' && (loadingMethods || visibleMethods.length === 0)) continue;
    hidden.push(key);
  }
  return hidden;
}

export function buildPaymentOverflowOptions(
  t: Strings,
  shopPaymentMethods: CheckoutPaymentBootstrap['shopPaymentMethods'],
  paymentMethodCountries: PaymentMethodCountries,
  effectiveCountries: readonly string[],
  walletAvailability: CheckoutPaymentBootstrap['walletAvailability'],
  googlePayEnabled: boolean,
  applePayEnabled: boolean,
  paypalEnabled: boolean,
  bancontactEnabled: boolean,
  newCardEnabled: boolean,
  loadingMethods: boolean,
  visibleMethods: PaymentMethod[],
  promotedKeys: ReadonlySet<PaymentOverflowKey>,
): CheckoutOverflowPickerOption[] {
  const options: CheckoutOverflowPickerOption[] = [];

  for (const key of hiddenOverflowPaymentKeys(
    shopPaymentMethods,
    paymentMethodCountries,
    effectiveCountries,
    walletAvailability,
    googlePayEnabled,
    applePayEnabled,
    paypalEnabled,
    bancontactEnabled,
    newCardEnabled,
    loadingMethods,
    visibleMethods,
    promotedKeys,
  )) {
    if (key === 'google_pay') {
      options.push({
        id: 'google_pay',
        label: 'Google Pay',
        description: t.paymentMethods.googlePayDescription,
        leading: <PaymentBrandMark brand="google_pay" className={styles.googlePayBrand} />,
      });
    } else if (key === 'apple_pay') {
      options.push({
        id: 'apple_pay',
        label: 'Apple Pay',
        description: t.paymentMethods.applePayDescription,
        leading: <PaymentBrandMark brand="apple_pay" className={styles.applePayBrand} />,
      });
    } else if (key === 'paypal') {
      options.push({
        id: 'paypal',
        label: 'PayPal',
        description: t.paymentMethods.paypalDescription,
        leading: <PaymentBrandMark brand="paypal" className={styles.paypalBrand} />,
      });
    } else if (key === 'bancontact') {
      options.push({
        id: 'bancontact',
        label: 'Bancontact',
        description: t.paymentMethods.bancontactDescription,
        leading: <PaymentBrandMark brand="bancontact" className={styles.bancontactBrand} />,
      });
    } else if (key === 'new_card') {
      options.push({
        id: 'new_card',
        label: t.cart.overflowOptionNewCard,
        description: t.paymentMethods.newCardDescription,
      });
    } else if (key === 'card') {
      options.push({
        id: 'card',
        label: t.cart.overflowOptionCard,
        description: t.paymentMethods.secureDataNotice,
      });
    }
  }
  return options;
}

/** Pure payment-choice rows. Selection and API state stay in the checkout
 * controller, making this safely reusable while keeping the radio DOM intact. */
export function CheckoutPaymentMethodList({
  t,
  shopPaymentMethods,
  paymentMethodCountries,
  effectiveCountries,
  promotedKeys,
  walletAvailability,
  googlePayEnabled,
  applePayEnabled,
  paypalEnabled,
  bancontactEnabled,
  newCardEnabled,
  googlePayIsDefault,
  applePayIsDefault,
  payPalIsDefault,
  bancontactIsDefault,
  selectedWallet,
  payPalSelected,
  bancontactSelected,
  newCardSelected,
  selectedCardId,
  loadingMethods,
  visibleMethods,
  onSelectWallet,
  onSelectPayPal,
  onSelectBancontact,
  onSelectNewCard,
  onSelectCard,
  onDeleteCard,
}: CheckoutPaymentMethodListProps) {
  const googleTier = tierForMethod(
    shopPaymentMethods.googlePay,
    googlePayEnabled,
    walletAvailability.googlePay,
    'google_pay',
    paymentMethodCountries,
    effectiveCountries,
  );
  const appleTier = tierForMethod(
    shopPaymentMethods.applePay,
    applePayEnabled,
    walletAvailability.applePay,
    'apple_pay',
    paymentMethodCountries,
    effectiveCountries,
  );
  const paypalTier = tierForMethod(
    shopPaymentMethods.paypal,
    paypalEnabled,
    true,
    'paypal',
    paymentMethodCountries,
    effectiveCountries,
  );
  const bancontactTier = tierForMethod(
    shopPaymentMethods.bancontact,
    bancontactEnabled,
    true,
    'bancontact',
    paymentMethodCountries,
    effectiveCountries,
  );
  const newCardTier = tierForMethod(
    shopPaymentMethods.card,
    newCardEnabled,
    true,
    'card',
    paymentMethodCountries,
    effectiveCountries,
  );
  const rememberedCardTier = tierForMethod(
    shopPaymentMethods.card,
    true,
    true,
    'card',
    paymentMethodCountries,
    effectiveCountries,
  );

  return (
    <div className={styles.methodList} role="radiogroup" aria-label={t.paymentMethods.pageTitle}>
      {visibleInList(googleTier, 'google_pay', promotedKeys) && (
        <div
          className={
            selectedWallet === 'google_pay'
              ? `${styles.methodRow} ${styles.methodRowSelected}`
              : styles.methodRow
          }
        >
          <div className={styles.methodRowHeader}>
            <label className={styles.methodRowMain} htmlFor="cart-pay-google-pay" aria-label="Google Pay">
              <input
                id="cart-pay-google-pay"
                type="radio"
                onMouseDown={suppressMouseFocus}
                name="payment-method"
                data-testid="cart-pay-google-pay"
                checked={selectedWallet === 'google_pay'}
                onChange={() => onSelectWallet('google_pay')}
              />
              <span className={styles.cardLines}>
                <span className={styles.cardNickname}>Google Pay</span>
                <span className={styles.cardBrandMuted}>{t.paymentMethods.googlePayDescription}</span>
              </span>
            </label>
            <span className={styles.methodRowTrailing}>
              {googlePayIsDefault && <span className={styles.defaultBadge}>{t.address.defaultBadge}</span>}
              <span className={styles.cardBrands} aria-hidden="true">
                <PaymentBrandMark brand="google_pay" className={styles.googlePayBrand} />
              </span>
            </span>
          </div>
        </div>
      )}

      {visibleInList(appleTier, 'apple_pay', promotedKeys) && (
        <div
          className={
            selectedWallet === 'apple_pay'
              ? `${styles.methodRow} ${styles.methodRowSelected}`
              : styles.methodRow
          }
        >
          <div className={styles.methodRowHeader}>
            <label className={styles.methodRowMain} htmlFor="cart-pay-apple-pay" aria-label="Apple Pay">
              <input
                id="cart-pay-apple-pay"
                type="radio"
                onMouseDown={suppressMouseFocus}
                name="payment-method"
                data-testid="cart-pay-apple-pay"
                checked={selectedWallet === 'apple_pay'}
                onChange={() => onSelectWallet('apple_pay')}
              />
              <span className={styles.cardLines}>
                <span className={styles.cardNickname}>Apple Pay</span>
                <span className={styles.cardBrandMuted}>{t.paymentMethods.applePayDescription}</span>
              </span>
            </label>
            <span className={styles.methodRowTrailing}>
              {applePayIsDefault && <span className={styles.defaultBadge}>{t.address.defaultBadge}</span>}
              <span className={styles.cardBrands} aria-hidden="true">
                <PaymentBrandMark brand="apple_pay" className={styles.applePayBrand} />
              </span>
            </span>
          </div>
        </div>
      )}

      {visibleInList(paypalTier, 'paypal', promotedKeys) && (
        <div
          className={payPalSelected ? `${styles.methodRow} ${styles.methodRowSelected}` : styles.methodRow}
        >
          <div className={styles.methodRowHeader}>
            <label className={styles.methodRowMain} htmlFor="cart-pay-paypal" aria-label="PayPal">
              <input
                id="cart-pay-paypal"
                type="radio"
                onMouseDown={suppressMouseFocus}
                name="payment-method"
                data-testid="cart-pay-paypal"
                checked={payPalSelected}
                onChange={onSelectPayPal}
              />
              <span className={styles.cardLines}>
                <span className={styles.cardNickname}>PayPal</span>
                <span className={styles.cardBrandMuted}>{t.paymentMethods.paypalDescription}</span>
              </span>
            </label>
            <span className={styles.methodRowTrailing}>
              {payPalIsDefault && <span className={styles.defaultBadge}>{t.address.defaultBadge}</span>}
              <span className={styles.cardBrands} aria-hidden="true">
                <PaymentBrandMark brand="paypal" className={styles.paypalBrand} />
              </span>
            </span>
          </div>
        </div>
      )}

      {visibleInList(bancontactTier, 'bancontact', promotedKeys) && (
        <div
          className={
            bancontactSelected ? `${styles.methodRow} ${styles.methodRowSelected}` : styles.methodRow
          }
        >
          <div className={styles.methodRowHeader}>
            <label className={styles.methodRowMain} htmlFor="cart-pay-bancontact" aria-label="Bancontact">
              <input
                id="cart-pay-bancontact"
                type="radio"
                onMouseDown={suppressMouseFocus}
                name="payment-method"
                data-testid="cart-pay-bancontact"
                checked={bancontactSelected}
                onChange={onSelectBancontact}
              />
              <span className={styles.cardLines}>
                <span className={styles.cardNickname}>Bancontact</span>
                <span className={styles.cardBrandMuted}>{t.paymentMethods.bancontactDescription}</span>
              </span>
            </label>
            <span className={styles.methodRowTrailing}>
              {bancontactIsDefault && <span className={styles.defaultBadge}>{t.address.defaultBadge}</span>}
              <span className={styles.cardBrands} aria-hidden="true">
                <PaymentBrandMark brand="bancontact" className={styles.bancontactBrand} />
              </span>
            </span>
          </div>
        </div>
      )}

      {visibleInList(newCardTier, 'new_card', promotedKeys) && (
        <div
          className={
            newCardSelected ? `${styles.methodRow} ${styles.methodRowSelected}` : styles.methodRow
          }
        >
          <div className={styles.methodRowHeader}>
            <label
              className={styles.methodRowMain}
              htmlFor="cart-pay-new-card"
              aria-label={t.cart.newCardPaymentMethodLabel}
            >
              <input
                id="cart-pay-new-card"
                type="radio"
                onMouseDown={suppressMouseFocus}
                name="payment-method"
                data-testid="cart-pay-new-card"
                checked={newCardSelected}
                onChange={onSelectNewCard}
              />
              <span className={styles.cardLines}>
                <span className={styles.cardNickname}>{t.cart.newCardPaymentMethodLabel}</span>
                <span className={styles.cardBrandMuted}>{t.paymentMethods.newCardDescription}</span>
              </span>
            </label>
            <span className={styles.methodRowTrailing}>
              <span className={styles.cardBrands} aria-hidden="true">
                <span className={styles.visaBrand}>VISA</span>
                <span className={styles.mastercardBrand}>
                  <i />
                  <i />
                </span>
              </span>
            </span>
          </div>
        </div>
      )}

      {visibleInList(rememberedCardTier, 'card', promotedKeys) &&
        !loadingMethods &&
        visibleMethods.map((pm) => (
          <div
            key={pm.id}
            className={
              selectedCardId === pm.id ? `${styles.methodRow} ${styles.methodRowSelected}` : styles.methodRow
            }
          >
            <div className={styles.methodRowHeader}>
              <label className={styles.methodRowMain}>
                <input
                  type="radio"
                  onMouseDown={suppressMouseFocus}
                  name="payment-method"
                  data-testid="cart-pay-card"
                  checked={selectedCardId === pm.id}
                  onChange={() => onSelectCard(pm.id)}
                />
                <span className={styles.cardLines}>
                  {pm.cardholderName && <span className={styles.cardNickname}>{pm.cardholderName}</span>}
                  <span className={pm.cardholderName ? styles.cardBrandMuted : undefined}>
                    {BRAND_LABELS[pm.brand] ?? pm.brand} •••• {pm.last4}
                  </span>
                </span>
              </label>
              <span className={styles.methodRowTrailing}>
                <span className={styles.cardBrands} aria-hidden="true">
                  <CardBrandMark brand={pm.brand} />
                </span>
              </span>
              <div className={styles.methodRowActions}>
                <button
                  type="button"
                  className={`${styles.methodIconButton} ${styles.methodIconButtonDelete}`}
                  aria-label={t.paymentMethods.deleteButton}
                  onClick={() => onDeleteCard(pm.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M2 3.5H12M5.4 3.5V2.2C5.4 1.9 5.6 1.7 5.9 1.7H8.1C8.4 1.7 8.6 1.9 8.6 2.2V3.5M3.6 3.5 4.1 11.9C4.1 12.2 4.4 12.4 4.6 12.4H9.4C9.7 12.4 9.9 12.2 9.9 11.9L10.4 3.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
