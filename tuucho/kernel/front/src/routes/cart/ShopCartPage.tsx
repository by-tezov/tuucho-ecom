import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useAuthSession } from '../../state/AuthContext';
import { useCartData, useCartCommands } from '../../hooks/useCart';
import { useOrders } from '../../hooks/useOrders';
import { useCartSizePickerRestore } from '../../hooks/useCartSizePickerRestore';
import { type CheckoutVoucher } from '../../api/checkout';
import { Seo } from '../../components/seo/Seo';
import { cartDisplayName, formatCartItemCount } from '../../utils/cartDisplayName';
import { giftCartIsLocked } from '../../utils/giftCartEdit';
import { CartSwitcher } from '../../components/cart/CartSwitcher';
import { LoadingModal } from '../../components/ui/LoadingModal';
import { ShopCartGiftReminder } from './ShopCartGiftReminder';
import { cancelGiftOffer } from '../../api/gift';
import { peekGiftCartFocus, takeGiftCartFocus } from '../../state/giftCartFocus';
import { useCartPageBootstrap } from '../../hooks/useCartPageBootstrap';
import { extraSetPreviewUnits } from '../../utils/cartExtra';
import { useGiverPortalSummary } from './useGiverPortalSummary';
import { useCartProductPresentation } from './useCartProductPresentation';
import { useCartSummarySticky } from './useCartSummarySticky';
import { useCartGuestDraft } from './useCartGuestDraft';
import { useShopCartCatalog } from './useShopCartCatalog';
import { useShopCartDelivery } from './useShopCartDelivery';
import { useShopCartPricing } from './useShopCartPricing';
import { finalizeShopCartPaymentSuccess, useShopCartCheckout } from './useShopCartCheckout';
import { useShopCartLineActions } from './useShopCartLineActions';
import { ShopCartDeliveryPanels } from './ShopCartDeliveryPanels';
import { CHECKOUT_FORM_ID, ShopCartPaymentPanel, ShopCartSummaryPanel } from './ShopCartPaymentSummaryPanels';
import { ShopCartEmptyState, ShopCartLinesSection } from './ShopCartLinesSection';
import { ShopCartOrderSuccess } from './ShopCartOrderSuccess';
import { ShopCartModals } from './ShopCartModals';
import cartFeatureStyles from '../../components/cart/CartFeature.module.css';
import pageStyles from '../CartPage.module.css';

const styles = { ...pageStyles, ...cartFeatureStyles };
export function ShopCartPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { status, authedRequest, user } = useAuthSession();
  const { items, extraSets, extraUnitCount, extraLocked, carts, cartLimit, activeCart, cartReady } =
    useCartData();
  const {
    addToCart,
    updateCartLine,
    removeFromCart,
    refreshCart,
    refreshCarts,
    createCart,
    renameCart,
    activateCart,
    deleteCart,
    mergeIntoActive,
    moveToWishlist,
  } = useCartCommands();
  const { refreshOrders } = useOrders();
  const { restore: restoreSizePicker, clear: clearSizePickerRestore } = useCartSizePickerRestore();

  const isGiftCart = activeCart?.kind === 'gift';
  const giftStatus = activeCart?.gift?.status;
  const giftLocked = giftCartIsLocked({ isGiftCart, giftStatus, items });
  const giftPayable = giftStatus === 'awaiting_payment' || giftStatus === 'paying';
  const canMoveToWishlist = status === 'authenticated' && !isGiftCart;
  const [giftSummary, setGiftSummary] = useGiverPortalSummary({
    isGiftCart,
    giverToken: activeCart?.gift?.giverToken,
    status,
    authedRequest,
  });
  const [giftUnlocking, setGiftUnlocking] = useState(false);
  const [giftCancelling, setGiftCancelling] = useState(false);
  const [giftActionError, setGiftActionError] = useState<string | null>(null);
  const [giftConfirm, setGiftConfirm] = useState<'cancel' | null>(null);
  const [giftFocusPending, setGiftFocusPending] = useState(() => Boolean(peekGiftCartFocus()));

  // Gift/rule lines must not keep Phase B running for an otherwise empty cart.
  // Locked giver-cart user lines and composed sets still count: courier/pay must load.
  const hasUserLines = items.some((item) =>
    isGiftCart ? item.origin !== 'rule' : item.locked !== true && item.origin !== 'rule',
  );
  const boot = useCartPageBootstrap({
    status,
    cartReady,
    hasUserLines: hasUserLines || extraUnitCount > 0,
    activeCartId: activeCart?.id ?? null,
    lang,
    authedRequest,
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      setGiftFocusPending(false);
      return;
    }
    const focusId = takeGiftCartFocus();
    if (!focusId || activeCart?.id === focusId) {
      setGiftFocusPending(false);
      return;
    }
    void activateCart(focusId).finally(() => setGiftFocusPending(false));
  }, [status, activateCart, activeCart?.id]);

  const { gallerySets, productsById, productsReady } = useCartProductPresentation({
    items,
    language: lang,
    status,
    authedRequest,
  });

  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const { guestEmail, setGuestEmail, guestConsent, setGuestConsent } = useCartGuestDraft();
  const [promoCode, setPromoCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<CheckoutVoucher | null>(null);
  const [applyLoyalty, setApplyLoyalty] = useState(false);
  const [identificationFocus, setIdentificationFocus] = useState(false);

  const { summaryAnchorRef, summaryStackRef, mainColRef, summaryPinned, summaryBounds, summaryTop } =
    useCartSummarySticky(status);

  // Soft revalidate after ready. The cart provider already keeps the cart across remounts.
  useEffect(() => {
    if (!cartReady) return;
    void refreshCarts().catch(() => {
      // The global backend-health UI owns refresh failures; known cart data
      // remains usable rather than being replaced with an empty state.
    });
  }, [cartReady, refreshCarts]);

  const catalog = useShopCartCatalog({
    items,
    extraSets,
    gallerySets,
    productsById,
    isGiftCart,
    lang,
    status,
  });

  const delivery = useShopCartDelivery({
    boot,
    status,
    lang,
    authedRequest,
    isGiftCart,
    giftSummary,
    totalQuantity: catalog.totalQuantity,
    paymentMethodId,
    setPaymentMethodId,
    promoCode,
    setPromoCode,
    applyLoyalty,
    setApplyLoyalty,
    appliedVoucherCode: appliedVoucher?.code,
  });

  const checkout = useShopCartCheckout({
    status,
    authedRequest,
    items,
    guestExtra: extraSets,
    addresses: delivery.addresses,
    addressId: delivery.addressId,
    billingAddressId: delivery.billingAddressId,
    sameAsBilling: delivery.sameAsBilling,
    courierCode: delivery.courierCode,
    express: delivery.express,
    appliedVoucher,
    applyLoyalty,
    guestEmail,
    guestConsent,
    lang,
  });
  const pricing = useShopCartPricing({
    t,
    status,
    authedRequest,
    cartRules: catalog.cartRules,
    subtotal: catalog.subtotal,
    tierTotals: catalog.tierTotals,
    extraUnits: extraSetPreviewUnits(extraSets).filter((entry) => entry.available),
    nailQty: catalog.nailQty,
    totalQuantity: catalog.totalQuantity,
    cartFingerprint: catalog.cartFingerprint,
    giftLinesLength: catalog.giftLines.length,
    hasPurchasableItems: catalog.hasPurchasableItems,
    selectedCourier: delivery.selectedCourier,
    shippingCountryCode: delivery.shippingCountryCode,
    courierList: delivery.courierList,
    courierCode: delivery.courierCode,
    express: delivery.express,
    addressId: delivery.addressId,
    addressNotice: delivery.addressNotice,
    sameAsBilling: delivery.sameAsBilling,
    billingAddressId: delivery.billingAddressId,
    checkoutFormState: checkout.checkoutFormState,
    confirmedOrderNumber: checkout.confirmedOrderNumber,
    promoCode,
    setPromoCode,
    appliedVoucher,
    setAppliedVoucher,
    applyLoyalty,
    setApplyLoyalty,
    guestAddressInput: checkout.guestAddressInput,
    guestCheckoutItems: checkout.guestCheckoutItems,
    guestLoyaltyPreviewRequest: checkout.guestLoyaltyPreviewRequest,
  });

  const lineActions = useShopCartLineActions({
    status,
    lang,
    gallerySets,
    addToCart,
    updateCartLine,
    removeFromCart,
    moveToWishlist,
  });

  const bootstrapBlocking =
    boot.status === 'auth_loading' || boot.status === 'cart_loading' || boot.status === 'bootstrapping';
  const waitingProducts =
    (boot.status === 'ready' || boot.status === 'switching') && hasUserLines && !productsReady;
  const showPageContent =
    boot.status === 'empty' ||
    ((boot.status === 'ready' || boot.status === 'switching') && (!hasUserLines || productsReady));
  const showLoadingModal = bootstrapBlocking || waitingProducts || boot.status === 'switching';

  function handlePaymentSuccess(orderNumber: string, loyaltyEarn?: number | null) {
    finalizeShopCartPaymentSuccess({
      status,
      orderNumber,
      ...(loyaltyEarn !== undefined ? { loyaltyEarn } : {}),
      loyaltyPreview: pricing.loyaltyPreview,
      isGiftCart,
      giftSummary,
      giftReceiverName: activeCart?.gift?.receiverName,
      refreshCarts,
      refreshOrders,
      resetDeliveryAfterGuestOrder: delivery.resetDeliveryAfterGuestOrder,
      pruneOneTimeAddressesAfterOrder: delivery.pruneOneTimeAddressesAfterOrder,
      clearPromoAfterGuestOrder: pricing.clearPromoAfterGuestOrder,
      setPaymentMethodId,
      setGuestEmail,
      setGuestConsent,
      setConfirmedLoyaltyEarn: checkout.setConfirmedLoyaltyEarn,
      setConfirmedGiftReceiverName: checkout.setConfirmedGiftReceiverName,
      setConfirmedOrderNumber: checkout.setConfirmedOrderNumber,
    });
  }

  const pageTitle = t.cart.pageTitle;
  // Every cart but the default one is named on the title: custom / rebuy show
  // their stored name, Wish List and Unconnected their localized kind label.
  // The default checkout cart needs no note. It is the plain "Panier" page.
  const cartNameNote =
    status === 'authenticated' && activeCart && activeCart.kind !== 'default'
      ? cartDisplayName(activeCart, t)
      : '';

  if (checkout.confirmedOrderNumber) {
    return (
      <ShopCartOrderSuccess
        t={t}
        lang={lang}
        status={status}
        pageTitle={pageTitle}
        confirmedOrderNumber={checkout.confirmedOrderNumber}
        confirmedLoyaltyEarn={checkout.confirmedLoyaltyEarn}
        confirmedGiftReceiverName={checkout.confirmedGiftReceiverName}
      />
    );
  }

  if (!cartReady || giftFocusPending) {
    return (
      <section aria-labelledby="cart-h" className={styles.section} data-testid="cart-page">
        <Seo title={pageTitle} description={pageTitle} path="/cart" noindex />
        <h1 id="cart-h" className="visuallyHidden">
          {pageTitle}
        </h1>
        <LoadingModal message={t.cart.switchingCart} />
      </section>
    );
  }

  return (
    <section aria-labelledby="cart-h" className={styles.section} data-testid="cart-page">
      <Seo title={pageTitle} description={pageTitle} path="/cart" noindex />
      {(giftCancelling || showLoadingModal) && (
        <LoadingModal message={giftCancelling ? t.gift.cancelling : t.cart.switchingCart} />
      )}

      {showPageContent && status === 'authenticated' && carts.length > 0 && (
        <CartSwitcher
          carts={carts}
          cartLimit={cartLimit}
          t={t}
          lang={lang}
          onActivate={async (cartId) => {
            boot.beginSwitch();
            try {
              await activateCart(cartId);
            } catch {
              boot.endSwitch();
            }
          }}
          onDelete={async (cartId) => {
            const deletingActive = activeCart?.id === cartId;
            if (deletingActive) boot.beginSwitch();
            try {
              await deleteCart(cartId);
            } catch {
              if (deletingActive) boot.endSwitch();
            }
          }}
          onMerge={(sourceCartId) => mergeIntoActive(sourceCartId)}
          onCreate={(name) => createCart(name)}
          onRename={(cartId, name) => renameCart(cartId, name)}
        />
      )}

      {!showPageContent && (
        <h1 id="cart-h" className={styles.title} hidden>
          {pageTitle}
        </h1>
      )}

      {showPageContent && (
        <div className={styles.titleGroup}>
          {cartNameNote ? <p className={styles.cartNameNote}>{cartNameNote}</p> : null}
          <h1 id="cart-h" className={styles.title}>
            {pageTitle}
          </h1>
          {catalog.userLinesCount > 0 && (
            <p className={styles.titleSubtitle}>
              {formatCartItemCount(catalog.userLinesCount, t, lang)} · {t.cart.cartProgressText}
            </p>
          )}
        </div>
      )}

      {showPageContent && isGiftCart && (
        <ShopCartGiftReminder
          t={t}
          giftSummary={giftSummary}
          setGiftSummary={setGiftSummary}
          cartGift={activeCart?.gift}
          giftStatus={giftStatus}
          giftPayable={giftPayable}
          giftLocked={giftLocked}
          giftUnlocking={giftUnlocking}
          setGiftUnlocking={setGiftUnlocking}
          giftCancelling={giftCancelling}
          giftActionError={giftActionError}
          setGiftActionError={setGiftActionError}
          setGiftConfirm={setGiftConfirm}
          authedRequest={authedRequest}
          refreshCart={refreshCart}
        />
      )}

      {showPageContent && catalog.userLinesCount === 0 && (
        <ShopCartEmptyState t={t} lang={lang} isGiftCart={isGiftCart} giftPayable={giftPayable} />
      )}

      {showPageContent && catalog.userLinesCount > 0 && (
        <div className={styles.layout}>
          <div ref={mainColRef} className={styles.mainCol}>
            <ShopCartLinesSection
              t={t}
              lang={lang}
              extraLocked={extraLocked}
              status={status}
              giftLocked={giftLocked}
              giftPayable={giftPayable}
              isGiftCart={isGiftCart}
              canMoveToWishlist={canMoveToWishlist}
              isWishlistCart={activeCart?.kind === 'wishlist'}
              lineGroups={catalog.lineGroups}
              giftLines={catalog.giftLines}
              userAccessoryLines={catalog.userAccessoryLines}
              carouselAccessories={catalog.carouselAccessories}
              showRulesBlock={pricing.showRulesBlock}
              nailQtyTier={pricing.nailQtyTier}
              hasNonRuleItems={items.some((item) => item.origin !== 'rule')}
              restoreSizePicker={restoreSizePicker}
              onSizePickerRestored={clearSizePickerRestore}
              updateCartLine={updateCartLine}
              removeFromCart={removeFromCart}
              moveToWishlist={moveToWishlist}
              navigateToLogin={() =>
                navigate(localizedPath('/login', lang), { state: { returnTo: '/cart' } })
              }
              handleAddAsNewLine={lineActions.handleAddAsNewLine}
              handleReplaceLine={lineActions.handleReplaceLine}
              setRemovalTarget={lineActions.setRemovalTarget}
              onCancelLastGiftItem={() => setGiftConfirm('cancel')}
            />

            <ShopCartDeliveryPanels
              t={t}
              status={status}
              giftLocked={giftLocked}
              courierList={delivery.courierList}
              disabledCourierCodes={[...delivery.disabledCourierCodes]}
              checkoutEffectiveCountries={delivery.checkoutEffectiveCountries}
              promotedCourierCodes={delivery.promotedCourierCodes}
              courierCode={delivery.courierCode ?? null}
              defaultCourierCode={delivery.defaultCourierCode ?? null}
              totalQuantity={catalog.totalQuantity}
              shippingCountryCode={delivery.shippingCountryCode}
              express={delivery.express}
              cartRules={catalog.cartRules}
              francoMerchandise={pricing.francoMerchandise}
              freeShipping={pricing.freeShipping}
              noCourierFits={pricing.noCourierFits}
              courierBlockNotice={pricing.courierBlockNotice}
              courierOverflowOpen={delivery.courierOverflowOpen}
              courierOverflowOptions={delivery.courierOverflowOptions}
              livraisonAddresses={delivery.livraisonAddresses}
              facturationAddresses={delivery.facturationAddresses}
              countries={delivery.countries}
              addressId={delivery.addressId}
              billingAddressId={delivery.billingAddressId}
              selectedCourier={delivery.selectedCourier ?? null}
              addressBlockNotice={pricing.addressBlockNotice}
              billingBlockNotice={pricing.billingBlockNotice}
              sameAsBilling={delivery.sameAsBilling}
              setSameAsBilling={delivery.setSameAsBilling}
              setCourierOverflowOpen={delivery.setCourierOverflowOpen}
              selectCourier={delivery.selectCourier}
              setExpress={delivery.setExpress}
              handleOverflowCourierPick={delivery.handleOverflowCourierPick}
              selectAddress={delivery.selectAddress}
              selectBillingAddress={delivery.selectBillingAddress}
              setEditingAddress={delivery.setEditingAddress}
              setEditingBillingAddress={delivery.setEditingBillingAddress}
              handleDeleteAddress={delivery.handleDeleteAddress}
              openAddAddress={delivery.openAddAddress}
              openAddBillingAddress={delivery.openAddBillingAddress}
            />

            <ShopCartPaymentPanel
              t={t}
              isGiftCart={isGiftCart}
              giftPayable={giftPayable}
              checkoutFormIncomplete={pricing.checkoutFormIncomplete || extraLocked}
              isFreeOrder={pricing.isFreeOrder}
              grandTotal={pricing.grandTotal}
              formId={CHECKOUT_FORM_ID}
              paymentMethodId={paymentMethodId}
              setPaymentMethodId={setPaymentMethodId}
              handleCheckoutStateChange={checkout.handleCheckoutStateChange}
              handlePaymentSuccess={handlePaymentSuccess}
              createCardIntent={checkout.createCardIntent}
              createNewCardIntent={checkout.createNewCardIntent}
              createPayPalIntent={checkout.createPayPalIntent}
              createBancontactIntent={checkout.createBancontactIntent}
              createWalletIntent={checkout.createWalletIntent}
              completeFreeOrder={checkout.completeFreeOrder}
              guestEmailValid={checkout.guestEmailValid}
              guestConsent={guestConsent}
              guestEmail={guestEmail}
              status={status}
              userEmail={user?.email ?? null}
              userEmailVerified={Boolean(user?.emailVerified)}
              hasOutOfStockItems={catalog.hasOutOfStockItems}
              itemCounts={catalog.itemCounts}
              boot={boot}
              shippingCountryCode={delivery.shippingCountryCode}
              livraisonAddresses={delivery.livraisonAddresses}
              addressId={delivery.addressId}
              paymentNotice={pricing.paymentNotice}
            />
          </div>

          <ShopCartSummaryPanel
            t={t}
            formId={CHECKOUT_FORM_ID}
            summaryAnchorRef={summaryAnchorRef}
            summaryStackRef={summaryStackRef}
            summaryPinned={summaryPinned}
            identificationFocus={identificationFocus}
            summaryBounds={summaryBounds}
            summaryTop={summaryTop}
            setIdentificationFocus={setIdentificationFocus}
            setGuestEmail={setGuestEmail}
            setGuestConsent={setGuestConsent}
            summaryReadyForPayment={pricing.summaryReadyForPayment && !extraLocked}
            subtotal={catalog.subtotal}
            selectedTier={pricing.selectedTier}
            shippingListFee={pricing.shippingListFee}
            shippingFee={pricing.shippingFee}
            freeShippingApplied={pricing.freeShipping?.applied === true}
            rulesItemDiscount={pricing.rulesItemDiscount}
            appliedVoucher={appliedVoucher}
            showLoyaltyWallet={pricing.showLoyaltyWallet}
            loyaltyCredit={pricing.loyaltyCredit}
            loyaltyAvailable={pricing.loyaltyAvailable}
            applyLoyalty={applyLoyalty}
            loyaltyEarn={pricing.loyaltyPreview?.loyaltyEarn ?? 0}
            promoCode={promoCode}
            promoStatus={pricing.promoStatus}
            validatingPromo={pricing.validatingPromo}
            promoPending={pricing.promoPending}
            canValidatePromo={pricing.canValidatePromo}
            grandTotal={pricing.grandTotal}
            deliveryEstimateLine={pricing.deliveryEstimateLine}
            custodyEstimateLine={pricing.custodyEstimateLine}
            checkoutFormIncomplete={pricing.checkoutFormIncomplete}
            checkoutFormState={checkout.checkoutFormState}
            shippingCountryCode={delivery.shippingCountryCode}
            setPromoCode={setPromoCode}
            setAppliedVoucher={setAppliedVoucher}
            setPromoStatus={pricing.setPromoStatus}
            applyPromoCode={pricing.applyPromoCode}
            handleApplyLoyaltyChange={pricing.handleApplyLoyaltyChange}
          />
        </div>
      )}

      <ShopCartModals
        t={t}
        user={user}
        countries={delivery.countries}
        addresses={delivery.addresses}
        courierCode={delivery.courierCode}
        addAddressOpen={delivery.addAddressOpen}
        pickupAddressInitial={delivery.pickupAddressInitial}
        editingAddress={delivery.editingAddress}
        addBillingAddressOpen={delivery.addBillingAddressOpen}
        editingBillingAddress={delivery.editingBillingAddress}
        pendingDeleteAddressId={delivery.pendingDeleteAddressId}
        removalTarget={lineActions.removalTarget}
        gallerySets={gallerySets}
        productsById={productsById}
        canMoveToWishlist={canMoveToWishlist}
        isWishlistCart={activeCart?.kind === 'wishlist'}
        giftConfirm={giftConfirm}
        handleAddAddress={delivery.handleAddAddress}
        handleEditAddress={delivery.handleEditAddress}
        handleAddBillingAddress={delivery.handleAddBillingAddress}
        handleEditBillingAddress={delivery.handleEditBillingAddress}
        openPickupPointPickerFromCart={delivery.openPickupPointPickerFromCart}
        setAddAddressOpen={delivery.setAddAddressOpen}
        setPickupAddressInitial={delivery.setPickupAddressInitial}
        setEditingAddress={delivery.setEditingAddress}
        setAddBillingAddressOpen={delivery.setAddBillingAddressOpen}
        setEditingBillingAddress={delivery.setEditingBillingAddress}
        setPendingDeleteAddressId={delivery.setPendingDeleteAddressId}
        confirmDeleteAddress={delivery.confirmDeleteAddress}
        confirmMoveToWishlist={lineActions.confirmMoveToWishlist}
        confirmDeleteFromCart={lineActions.confirmDeleteFromCart}
        closeRemovalDialog={lineActions.closeRemovalDialog}
        setGiftConfirm={setGiftConfirm}
        onConfirmGiftCancel={() => {
          const token = activeCart?.gift?.giverToken;
          setGiftConfirm(null);
          if (!token || giftCancelling) return;
          setGiftActionError(null);
          setGiftCancelling(true);
          void authedRequest((access) => cancelGiftOffer(token, access))
            .then(() => refreshCarts())
            .catch(() => setGiftActionError(t.gift.genericError))
            .finally(() => setGiftCancelling(false));
        }}
      />
    </section>
  );
}
