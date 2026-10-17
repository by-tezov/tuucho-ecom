import type { ComponentProps, CSSProperties, Ref } from 'react';
import type { Address } from '../../api/account';
import type { useLang } from '../../assets/i18n';
import type { CheckoutFormState } from '../../components/cart/CartCheckoutSection';
import { CartCheckoutSection } from '../../components/cart/CartCheckoutSection';
import { CartOrderSummary, type CartPromoStatus } from '../../components/cart/CartOrderSummary';
import { GuestCheckoutPrompt } from '../../components/checkout/GuestCheckoutPrompt';
import type { ConfirmDeliveryAddressFields } from '../../components/checkout/CheckoutConfirmationShell';
import type { CheckoutVoucher } from '../../api/checkout';
import type { useCartPageBootstrap } from '../../hooks/useCartPageBootstrap';
import { pickupPointName } from '../../utils/pickupPoint';
import cartFeatureStyles from '../../components/cart/CartFeature.module.css';
import pageStyles from '../CartPage.module.css';
import type { ConfirmItemCounts } from '../../components/checkout/checkoutContracts';
import { usePluginEnabled } from '../../plugins/StorefrontBootstrap';
import { CORE_FRONT_SLOTS, PluginSlot } from '../../plugins/PluginHost';

const styles = { ...pageStyles, ...cartFeatureStyles };

/** Only one CartCheckoutSection is ever mounted at a time, so a constant id
 * is safe. The sticky summary sidebar's "Payer" button submits this form
 * via the plain HTML form="…" attribute despite living outside its DOM
 * subtree (see CartCheckoutSectionProps' formId doc comment). */
export const CHECKOUT_FORM_ID = 'cart-checkout-form';

type T = ReturnType<typeof useLang>['t'];
type Boot = ReturnType<typeof useCartPageBootstrap>;

function toConfirmDeliveryAddress(address: Address | undefined): ConfirmDeliveryAddressFields | null {
  if (!address) return null;
  return {
    companyName: address.companyName,
    recipientName: address.recipientName,
    pickupPointName: pickupPointName(address.pickupPoints),
    line1: address.line1,
    line2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: address.countryCode,
  };
}

export function ShopCartPaymentPanel(props: {
  t: T;
  isGiftCart: boolean;
  giftPayable: boolean;
  checkoutFormIncomplete: boolean;
  isFreeOrder: boolean;
  grandTotal: number;
  formId: string;
  paymentMethodId: string | null;
  setPaymentMethodId: (id: string | null) => void;
  handleCheckoutStateChange: (state: CheckoutFormState) => void;
  handlePaymentSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  createCardIntent: ComponentProps<typeof CartCheckoutSection>['onCreateCardIntent'];
  createNewCardIntent: ComponentProps<typeof CartCheckoutSection>['onCreateNewCardIntent'];
  createPayPalIntent: ComponentProps<typeof CartCheckoutSection>['onCreatePayPalIntent'];
  createBancontactIntent: ComponentProps<typeof CartCheckoutSection>['onCreateBancontactIntent'];
  createWalletIntent: ComponentProps<typeof CartCheckoutSection>['onCreateWalletIntent'];
  completeFreeOrder: ComponentProps<typeof CartCheckoutSection>['onCompleteFreeOrder'];
  guestEmailValid: boolean;
  guestConsent: boolean;
  guestEmail: string;
  status: string;
  userEmail: string | null;
  userEmailVerified: boolean;
  hasOutOfStockItems: boolean;
  itemCounts: ConfirmItemCounts;
  boot: Boot;
  shippingCountryCode: string | null | undefined;
  livraisonAddresses: Address[];
  addressId: string | null;
  paymentNotice: string | null;
}) {
  const {
    t,
    isGiftCart,
    giftPayable,
    checkoutFormIncomplete,
    isFreeOrder,
    grandTotal,
    formId,
    paymentMethodId,
    setPaymentMethodId,
    handleCheckoutStateChange,
    handlePaymentSuccess,
    createCardIntent,
    createNewCardIntent,
    createPayPalIntent,
    createBancontactIntent,
    createWalletIntent,
    completeFreeOrder,
    guestEmailValid,
    guestConsent,
    guestEmail,
    status,
    userEmail,
    userEmailVerified,
    hasOutOfStockItems,
    itemCounts,
    boot,
    shippingCountryCode,
    livraisonAddresses,
    addressId,
    paymentNotice,
  } = props;

  if (isGiftCart && !giftPayable) return null;

  const deliveryAddress = toConfirmDeliveryAddress(livraisonAddresses.find((row) => row.id === addressId));

  return (
    <div className={styles.paymentSection}>
      {boot.data && (
        <CartCheckoutSection
          key={boot.data.generation}
          t={t}
          deliveryReady={!checkoutFormIncomplete}
          isFreeOrder={isFreeOrder}
          total={grandTotal}
          formId={formId}
          selectedPaymentMethodId={paymentMethodId}
          onPaymentMethodChange={setPaymentMethodId}
          onStateChange={handleCheckoutStateChange}
          onSuccess={handlePaymentSuccess}
          onCreateCardIntent={createCardIntent}
          onCreateNewCardIntent={createNewCardIntent}
          onCreatePayPalIntent={createPayPalIntent}
          onCreateBancontactIntent={createBancontactIntent}
          onCreateWalletIntent={createWalletIntent}
          onCompleteFreeOrder={completeFreeOrder}
          guestCheckoutReady={guestEmailValid && guestConsent}
          receiptEmail={
            status === 'anonymous'
              ? guestEmail.trim() || null
              : userEmail && !userEmailVerified
                ? userEmail
                : null
          }
          hasOutOfStockItems={hasOutOfStockItems}
          itemCounts={itemCounts}
          paymentBootstrap={{
            ...boot.data.payment,
            walletAvailability: boot.data.walletAvailability,
            revision: boot.data.revision,
          }}
          shippingCountryCode={shippingCountryCode ?? undefined}
          deliveryAddress={deliveryAddress}
        />
      )}
      <PluginSlot name={CORE_FRONT_SLOTS.checkoutPayment} />
      {paymentNotice && (
        <p className={styles.error} data-testid="cart-payment-error">
          {paymentNotice}
        </p>
      )}
    </div>
  );
}

export function ShopCartSummaryPanel(props: {
  t: T;
  formId: string;
  summaryAnchorRef: Ref<HTMLElement>;
  summaryStackRef: Ref<HTMLDivElement>;
  summaryPinned: boolean;
  identificationFocus: boolean;
  summaryBounds: { left: number; width: number } | null;
  summaryTop: number;
  setIdentificationFocus: (value: boolean) => void;
  setGuestEmail: (email: string) => void;
  setGuestConsent: (consent: boolean) => void;
  summaryReadyForPayment: boolean;
  subtotal: number;
  selectedTier: unknown;
  shippingListFee: number | null | undefined;
  shippingFee: number | null | undefined;
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
  shippingCountryCode: string | null | undefined;
  setPromoCode: (code: string) => void;
  setAppliedVoucher: (voucher: CheckoutVoucher | null) => void;
  setPromoStatus: (status: CartPromoStatus | null) => void;
  applyPromoCode: () => void;
  handleApplyLoyaltyChange: (apply: boolean) => void;
}) {
  const vouchersOn = usePluginEnabled('tuucho-commerce-vouchers');
  const {
    t,
    formId,
    summaryAnchorRef,
    summaryStackRef,
    summaryPinned,
    identificationFocus,
    summaryBounds,
    summaryTop,
    setIdentificationFocus,
    setGuestEmail,
    setGuestConsent,
    summaryReadyForPayment,
    subtotal,
    selectedTier,
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
    shippingCountryCode,
    setPromoCode,
    setAppliedVoucher,
    setPromoStatus,
    applyPromoCode,
    handleApplyLoyaltyChange,
  } = props;

  return (
    <aside ref={summaryAnchorRef} className={styles.summaryCol}>
      <div
        ref={summaryStackRef}
        className={[
          styles.summaryStack,
          summaryPinned ? styles.summaryStackPinned : '',
          identificationFocus ? styles.summaryStackFocus : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          summaryPinned && summaryBounds
            ? ({
                '--summary-card-left': `${summaryBounds.left}px`,
                '--summary-card-width': `${summaryBounds.width}px`,
                '--summary-top': `${summaryTop}px`,
              } as CSSProperties)
            : undefined
        }
      >
        <GuestCheckoutPrompt
          t={t}
          onSocialChoiceFocusChange={setIdentificationFocus}
          onDraftChange={({ email, consent }) => {
            setGuestEmail(email);
            setGuestConsent(consent);
          }}
        />
        <CartOrderSummary
          t={t}
          formId={formId}
          readyForPayment={summaryReadyForPayment}
          subtotal={subtotal}
          showShipping={selectedTier != null}
          shippingListFee={shippingListFee ?? undefined}
          shippingFee={shippingFee ?? undefined}
          freeShippingApplied={freeShippingApplied}
          rulesItemDiscount={rulesItemDiscount}
          appliedVoucher={appliedVoucher}
          showLoyaltyWallet={showLoyaltyWallet}
          loyaltyCredit={loyaltyCredit}
          loyaltyAvailable={loyaltyAvailable}
          applyLoyalty={applyLoyalty}
          loyaltyEarn={loyaltyEarn}
          promoCode={promoCode}
          promoStatus={promoStatus}
          validatingPromo={validatingPromo}
          promoPending={promoPending}
          canValidatePromo={canValidatePromo}
          grandTotal={grandTotal}
          deliveryEstimateLine={deliveryEstimateLine}
          custodyEstimateLine={custodyEstimateLine}
          checkoutFormIncomplete={checkoutFormIncomplete}
          checkoutFormState={checkoutFormState}
          deliveryCountry={shippingCountryCode}
          onPromoCodeChange={(code) => {
            setPromoCode(code);
            if (appliedVoucher) setAppliedVoucher(null);
            setPromoStatus(null);
          }}
          onApplyPromoCode={applyPromoCode}
          onApplyLoyaltyChange={handleApplyLoyaltyChange}
          showPromo={vouchersOn}
        />
        <PluginSlot name={CORE_FRONT_SLOTS.cartSummary} />
      </div>
    </aside>
  );
}
