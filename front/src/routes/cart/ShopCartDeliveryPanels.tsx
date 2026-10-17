import type { useLang } from '../../assets/i18n';
import type { Address, Country, Courier } from '../../api/account';
import type { PublicCartRule } from '../../utils/cartRulesPreview';
import { CartCourierSection } from '../../components/cart/CartCourierSection';
import { CartAddressSection } from '../../components/cart/CartAddressSection';
import { CheckoutOverflowPickerModal } from '../../components/checkout/CheckoutOverflowPickerModal';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { saveGuestAddressState } from '../../state/guestCardVault';
import cartFeatureStyles from '../../components/cart/CartFeature.module.css';
import pageStyles from '../CartPage.module.css';

const styles = { ...pageStyles, ...cartFeatureStyles };

type T = ReturnType<typeof useLang>['t'];

export function ShopCartDeliveryPanels(props: {
  t: T;
  status: string;
  giftLocked: boolean;
  courierList: Courier[];
  disabledCourierCodes: readonly string[];
  checkoutEffectiveCountries: Parameters<typeof CartCourierSection>[0]['effectiveCountries'];
  promotedCourierCodes: ReadonlySet<string>;
  courierCode: string | null;
  defaultCourierCode: string | null;
  totalQuantity: number;
  shippingCountryCode: string | null | undefined;
  express: boolean;
  cartRules: PublicCartRule[];
  francoMerchandise: number;
  freeShipping: Parameters<typeof CartCourierSection>[0]['freeShipping'];
  noCourierFits: boolean;
  courierBlockNotice: string | null;
  courierOverflowOpen: boolean;
  courierOverflowOptions: Parameters<typeof CheckoutOverflowPickerModal>[0]['options'];
  livraisonAddresses: Address[];
  facturationAddresses: Address[];
  countries: Country[];
  addressId: string | null;
  billingAddressId: string | null;
  selectedCourier: Courier | null;
  addressBlockNotice: string | null;
  billingBlockNotice: string | null;
  sameAsBilling: boolean;
  setSameAsBilling: (next: boolean) => void;
  setCourierOverflowOpen: (open: boolean) => void;
  selectCourier: (code: string) => void;
  setExpress: (value: boolean) => void;
  handleOverflowCourierPick: (code: string) => void;
  selectAddress: (id: string) => void;
  selectBillingAddress: (id: string) => void;
  setEditingAddress: (address: Address | null) => void;
  setEditingBillingAddress: (address: Address | null) => void;
  handleDeleteAddress: (id: string) => void;
  openAddAddress: () => void;
  openAddBillingAddress: () => void;
}) {
  const {
    t,
    status,
    giftLocked,
    courierList,
    disabledCourierCodes,
    checkoutEffectiveCountries,
    promotedCourierCodes,
    courierCode,
    defaultCourierCode,
    totalQuantity,
    shippingCountryCode,
    express,
    cartRules,
    francoMerchandise,
    freeShipping,
    noCourierFits,
    courierBlockNotice,
    courierOverflowOpen,
    courierOverflowOptions,
    livraisonAddresses,
    facturationAddresses,
    countries,
    addressId,
    billingAddressId,
    selectedCourier,
    addressBlockNotice,
    billingBlockNotice,
    sameAsBilling,
    setSameAsBilling,
    setCourierOverflowOpen,
    selectCourier,
    setExpress,
    handleOverflowCourierPick,
    selectAddress,
    selectBillingAddress,
    setEditingAddress,
    setEditingBillingAddress,
    handleDeleteAddress,
    openAddAddress,
    openAddBillingAddress,
  } = props;

  return (
    <>
      <CartCourierSection
        t={t}
        couriers={courierList}
        disabledCourierCodes={
          giftLocked
            ? [
                ...new Set([
                  ...disabledCourierCodes,
                  ...courierList.map((c) => c.code).filter((code) => code !== courierCode),
                ]),
              ]
            : [...disabledCourierCodes]
        }
        effectiveCountries={checkoutEffectiveCountries}
        promotedCourierCodes={promotedCourierCodes}
        selectedCourierCode={courierCode}
        defaultCourierCode={defaultCourierCode}
        totalQuantity={totalQuantity}
        shippingCountryCode={shippingCountryCode ?? undefined}
        express={express}
        cartRules={cartRules}
        francoMerchandise={francoMerchandise}
        freeShipping={freeShipping}
        noCourierFits={noCourierFits}
        blockNotice={courierBlockNotice}
        onOpenOverflowModal={giftLocked ? () => undefined : () => setCourierOverflowOpen(true)}
        onSelectCourier={giftLocked ? () => undefined : selectCourier}
        onExpressChange={giftLocked ? () => undefined : setExpress}
      />
      {courierOverflowOpen && (
        <CheckoutOverflowPickerModal
          title={t.cart.overflowModalCourierTitle}
          closeLabel={t.gallery.close}
          options={courierOverflowOptions}
          onSelect={handleOverflowCourierPick}
          onClose={() => setCourierOverflowOpen(false)}
        />
      )}

      <CartAddressSection
        t={t}
        title={t.cart.addressHeading}
        addresses={livraisonAddresses}
        countries={countries}
        couriers={courierList}
        selectedAddressId={addressId}
        radioName="address"
        addTestId="cart-add-address"
        optionTestId="cart-address-option"
        selectedCourier={selectedCourier ?? undefined}
        blockNotice={addressBlockNotice}
        onSelect={selectAddress}
        onEdit={setEditingAddress}
        onDelete={handleDeleteAddress}
        onAdd={openAddAddress}
        hideAdd={giftLocked}
      >
        <label className={styles.sameAsBillingRow}>
          <input
            type="checkbox"
            onMouseDown={suppressMouseFocus}
            checked={sameAsBilling}
            disabled={giftLocked}
            onChange={(e) => {
              const next = e.target.checked;
              setSameAsBilling(next);
              if (status === 'anonymous') void saveGuestAddressState({ sameAsBilling: next });
            }}
          />
          {t.cart.sameAsBillingLabel}
        </label>
      </CartAddressSection>

      {!sameAsBilling && (
        <CartAddressSection
          t={t}
          title={t.cart.billingAddressHeading}
          addresses={facturationAddresses}
          countries={countries}
          couriers={courierList}
          selectedAddressId={billingAddressId}
          radioName="billingAddress"
          addTestId="cart-add-billing-address"
          blockNotice={billingBlockNotice}
          onSelect={selectBillingAddress}
          onEdit={setEditingBillingAddress}
          onDelete={handleDeleteAddress}
          onAdd={openAddBillingAddress}
          hideAdd={giftLocked}
        />
      )}
    </>
  );
}
