import type { CheckoutVoucher } from '../../api/checkout';
import type { Strings } from '../../assets/i18n/types';
import { FIELD_VOUCHER_CODE_MAX } from '../../utils/fieldLimits';
import { formatPrice } from '../../utils/formatPrice';
import { Button } from '../ui/Button';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { PENDING_SHIPPING_PRICE } from './CartCourierSection';
import type { CheckoutFormState } from '../checkout/checkoutContracts';
import { AcceptedPaymentMarks } from '../checkout/AcceptedPaymentMarks';
import { ReassuranceStrip, type ReassuranceKey } from '../trust/ReassuranceStrip';
import styles from './CartFeature.module.css';

/** Under the pay button, payment already has its own line (Stripe + marks),
 * so the strip trades it for the kit included with every set. */
const CART_REASSURANCE: readonly ReassuranceKey[] = ['handmade', 'madeAndShipped', 'tracked', 'kit'];

export interface CartPromoStatus {
  tone: 'success' | 'error';
  text: string;
}

interface CartOrderSummaryProps {
  t: Strings;
  formId: string;
  readyForPayment: boolean;
  subtotal: number;
  showShipping: boolean;
  shippingListFee: number | null | undefined;
  shippingFee: number | undefined;
  freeShippingApplied: boolean;
  rulesItemDiscount: number;
  appliedVoucher: CheckoutVoucher | null;
  showLoyaltyWallet: boolean;
  loyaltyCredit: number;
  loyaltyAvailable: number;
  applyLoyalty: boolean;
  loyaltyEarn: number;
  promoCode: string;
  promoStatus: CartPromoStatus | null;
  validatingPromo: boolean;
  promoPending: boolean;
  canValidatePromo: boolean;
  grandTotal: number;
  deliveryEstimateLine: string | null;
  custodyEstimateLine: string | null;
  checkoutFormIncomplete: boolean;
  checkoutFormState: CheckoutFormState;
  /** Chosen address country; decides country-bound marks such as Bancontact. */
  deliveryCountry: string | null | undefined;
  onPromoCodeChange: (code: string) => void;
  onApplyPromoCode: () => void | Promise<void>;
  onApplyLoyaltyChange: (value: boolean) => void;
  showPromo?: boolean;
}

function SummaryDivider({ label }: { label: string }) {
  return (
    <div className={styles.summaryDivider} role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

/** Pricing, voucher and submit presentation for the sticky checkout column.
 * Server reservation remains authoritative; these totals are only a preview. */
export function CartOrderSummary({
  t,
  formId,
  readyForPayment,
  subtotal,
  showShipping,
  shippingListFee,
  shippingFee,
  freeShippingApplied,
  rulesItemDiscount,
  appliedVoucher,
  showLoyaltyWallet,
  loyaltyCredit,
  loyaltyAvailable,
  applyLoyalty,
  loyaltyEarn,
  promoCode,
  promoStatus,
  validatingPromo,
  promoPending,
  canValidatePromo,
  grandTotal,
  deliveryEstimateLine,
  custodyEstimateLine,
  checkoutFormIncomplete,
  checkoutFormState,
  deliveryCountry,
  onPromoCodeChange,
  onApplyPromoCode,
  onApplyLoyaltyChange,
  showPromo = true,
}: CartOrderSummaryProps) {
  const walletSwitchDisabled = loyaltyAvailable <= 0;

  return (
    <div className={`${styles.summaryCard} ${readyForPayment ? styles.summaryCardReady : ''}`}>
      <h2 className={styles.summaryTitle}>{t.cart.summaryHeading}</h2>

      <div className={styles.subtotalRow}>
        <span>{t.cart.subtotalLabel}</span>
        <span data-testid="cart-subtotal">{formatPrice(subtotal)}</span>
      </div>
      {showShipping && (
        <div className={styles.shippingRow}>
          <span>{t.cart.shippingFeeLabel}</span>
          <span className={styles.shippingFeeValue}>
            {shippingListFee == null ? (
              PENDING_SHIPPING_PRICE
            ) : freeShippingApplied ? (
              <>
                <span className={styles.priceStruck}>{formatPrice(shippingListFee)}</span>
                <span className={styles.shippingFreeLabel}>{t.cart.rulesFreePrice}</span>
              </>
            ) : (
              formatPrice(shippingFee ?? shippingListFee)
            )}
          </span>
        </div>
      )}
      {rulesItemDiscount > 0 && (
        <div className={styles.discountRow} data-testid="cart-rules-discount">
          <span>{t.cart.rulesTierDiscountLabel}</span>
          <span>−{formatPrice(rulesItemDiscount)}</span>
        </div>
      )}

      {showPromo ? (
      <>
      <SummaryDivider label={t.cart.summaryPromoDivider} />
      <div className={styles.promoRow}>
        <input
          type="text"
          name="promo-code"
          autoComplete="off"
          maxLength={FIELD_VOUCHER_CODE_MAX}
          className={styles.promoInput}
          data-testid="cart-voucher-input"
          placeholder={t.cart.promoCodePlaceholder}
          aria-label={t.cart.promoCodePlaceholder}
          value={promoCode}
          onChange={(event) => onPromoCodeChange(event.target.value)}
        />
        <button
          type="button"
          className={styles.promoButton}
          data-testid="cart-voucher-apply"
          disabled={validatingPromo || !promoCode.trim()}
          onClick={() => void onApplyPromoCode()}
        >
          {t.cart.validatePromoButton}
        </button>
      </div>
      {promoStatus && (
        <p
          className={promoStatus.tone === 'success' ? styles.promoSuccess : styles.promoError}
          data-testid={promoStatus.tone === 'success' ? 'cart-voucher-success' : 'cart-voucher-error'}
        >
          {promoStatus.text}
        </p>
      )}
      {appliedVoucher && (
        <div className={styles.discountRow}>
          <span>
            {t.cart.promoCodePlaceholder}: {appliedVoucher.code}
          </span>
          <span>−{formatPrice(appliedVoucher.discount)}</span>
        </div>
      )}
      </>
      ) : null}

      {showLoyaltyWallet && (
        <>
          <SummaryDivider label={t.cart.summaryWalletDivider} />
          <div className={styles.walletRow}>
            <p className={styles.walletAvailable}>
              {t.loyalty.cartWalletAvailable(formatPrice(loyaltyAvailable))}
            </p>
            <label className={styles.walletToggle}>
              <span>{t.loyalty.cartUseWallet}</span>
              <ToggleSwitch
                checked={applyLoyalty}
                disabled={walletSwitchDisabled}
                onChange={onApplyLoyaltyChange}
                aria-label={t.loyalty.cartUseWallet}
              />
            </label>
            {appliedVoucher && <p className={styles.walletNote}>{t.loyalty.cartIncompatibleVoucher}</p>}
          </div>
          {loyaltyCredit > 0 && (
            <div className={styles.discountRow}>
              <span>{t.loyalty.cartCreditLabel}</span>
              <span>−{formatPrice(loyaltyCredit)}</span>
            </div>
          )}
        </>
      )}

      <SummaryDivider label={t.cart.totalLabel} />

      <div className={styles.totalRow}>
        <span>{t.cart.totalLabel}</span>
        <span className={styles.totalValue}>{formatPrice(grandTotal)}</span>
      </div>
      {deliveryEstimateLine && (
        <p className={styles.deliveryEstimate} data-testid="cart-delivery-estimate">
          {deliveryEstimateLine}
          {custodyEstimateLine && ` · ${custodyEstimateLine}`}
        </p>
      )}

      <Button
        type={promoPending ? 'button' : 'submit'}
        form={formId}
        className={styles.payButton}
        data-testid="cart-pay-submit"
        onClick={promoPending ? () => void onApplyPromoCode() : undefined}
        disabled={
          checkoutFormIncomplete ||
          (promoPending ? !canValidatePromo : !checkoutFormState.canSubmit || checkoutFormState.submitting)
        }
      >
        {checkoutFormState.submitting
          ? t.cart.payingButton
          : `${t.cart.payButton} : ${formatPrice(grandTotal)}`}
      </Button>

      <div className={styles.paymentSecurity}>
        <p className={styles.trustNote}>
          <SecurePaymentIcon />
          {t.cart.securePaymentStripe}
        </p>
        <AcceptedPaymentMarks label={t.cart.acceptedPayments} deliveryCountry={deliveryCountry} />
      </div>

      {loyaltyEarn > 0 && (
        <p className={styles.loyaltyEarnCallout} role="note">
          {t.loyalty.cartEarnBelowPayPrefix}{' '}
          <strong className={styles.loyaltyEarnAmount} data-testid="cart-loyalty-earn">
            {formatPrice(loyaltyEarn)}
          </strong>{' '}
          {t.loyalty.cartEarnBelowPaySuffix}
        </p>
      )}

      <ReassuranceStrip t={t} items={CART_REASSURANCE} layout="list" className={styles.trustNotes} />
    </div>
  );
}

function SecurePaymentIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="9" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
