import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { localizedPath } from '@kernel/front/config/i18nRoutes';
import { shopConfig } from '@kernel/front/config/env';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { useCartCommands, useCartData } from '@kernel/front/hooks/useCart';
import { useGiftReceiver } from '@kernel/front/hooks/useGiftReceiver';
import { useCartProductPresentation } from '@kernel/front/routes/cart/useCartProductPresentation';
import { useCartSummarySticky } from '@kernel/front/routes/cart/useCartSummarySticky';
import {
  confirmReceiverChoice,
  getReceiverAddressCountries,
  getReceiverCouriers,
  putReceiverDestination,
  type GiftDestination,
} from '@kernel/front/api/gift';
import type { Address, AddressInput, Country, Courier } from '@kernel/front/api/account';
import type { CartItem, Size } from '@kernel/front/api/cart';
import { Seo } from '@kernel/front/components/seo/Seo';
import { ConfirmModal } from '@kernel/front/components/ui/ConfirmModal';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import { MainAreaFallback } from '@kernel/front/components/layout/MainAreaFallback';
import { fetchCartAccessories, fetchCartRules, type ProductById, type PublicCartRule } from '@kernel/front/api/gallery';
import { CartLine } from '@kernel/front/components/cart/CartLine';
import { PluginCartLines } from '@kernel/front/plugins/PluginHost';
import { AccessoryCartLine } from '@kernel/front/components/cart/AccessoryCartLine';
import { CartAccessoryCarousel } from '@kernel/front/components/cart/CartAccessoryCarousel';
import { CartRulesProgress } from '@kernel/front/components/cart/CartRulesProgress';
import { CartAddressSection } from '@kernel/front/components/cart/CartAddressSection';
import { CartCourierSection, buildCourierOverflowOptions } from '@kernel/front/components/cart/CartCourierSection';
import { CheckoutOverflowPickerModal } from '@kernel/front/components/checkout/CheckoutOverflowPickerModal';
import { FavoriteOrRemoveModal } from '@kernel/front/components/cart/FavoriteOrRemoveModal';
import { ItemPreviewRow } from '@kernel/front/components/cart/ItemPreviewRow';
import { AddressFormModal } from '@kernel/front/components/address/AddressFormModal';
import type { PickupPoint } from '@kernel/front/components/address/pickupPoint';
import { GiftReceiverFollowPage } from './GiftReceiverFollowPage';
import { GiftOrderSummary } from '@kernel/front/components/gift/GiftOrderSummary';
import { previewNailQtyTier } from '@kernel/front/utils/cartRulesPreview';
import { extraSetPreviewUnits, extraSetUnitCount, paidCatalogueSetQuantity } from '@kernel/front/utils/cartExtra';
import { groupCartLinesByShape } from '@kernel/front/utils/groupCartLines';
import { availableQuantityFor } from '@kernel/front/utils/availability';
import { lengthAfterShapeChange } from '@kernel/front/data/galleryShape';
import { courierOverflowTier } from '@kernel/front/utils/checkoutOverflow';
import { pickCourierTier } from '@kernel/front/utils/courierPricing';
import { courierCompatible, courierMatch } from '@kernel/front/utils/courierMatch';
import { accessoryFitsBudget, accessoryLinePhoto, packQtyMax } from '@kernel/front/utils/accessoryPacks';
import cartFeatureStyles from '@kernel/front/components/cart/CartFeature.module.css';
import pageStyles from '@kernel/front/routes/CartPage.module.css';
const styles = { ...pageStyles, ...cartFeatureStyles };
const GIFT_DISABLED_COURIERS: string[] = [];

function destinationAsAddress(destination: GiftDestination): Address {
  return {
    id: 'gift-destination',
    kind: 'livraison',
    label: null,
    recipientName: destination.recipientName,
    companyName: destination.companyName,
    line1: destination.line1,
    line2: destination.line2,
    deliveryNotes: destination.deliveryNotes,
    postalCode: destination.postalCode,
    city: destination.city,
    countryCode: destination.countryCode,
    phone: destination.phone,
    networkCodes: destination.networkCodes.length > 0 ? destination.networkCodes : ['home'],
    pickupPoints: destination.pickupPoints as Address['pickupPoints'],
    isDefault: true,
    savedForFuture: false,
  };
}

function addressInputToDestination(input: AddressInput, courierCode: string): GiftDestination {
  return {
    recipientName: input.recipientName ?? null,
    companyName: input.companyName ?? null,
    line1: input.line1,
    line2: input.line2 ?? null,
    deliveryNotes: input.deliveryNotes ?? null,
    postalCode: input.postalCode,
    city: input.city,
    countryCode: input.countryCode,
    phone: input.phone ?? null,
    courierCode,
    networkCodes: input.networkCodes && input.networkCodes.length > 0 ? input.networkCodes : ['home'],
    pickupPoints: input.pickupPoints ?? {},
  };
}

export function GiftReceiverCartPage() {
  const gift = useGiftReceiver();
  if (!gift.ready) return <MainAreaFallback />;
  if (gift.summary && gift.summary.status !== 'selecting') {
    return <GiftReceiverFollowPage />;
  }
  return <GiftReceiverSelectingCartPage />;
}

function GiftReceiverSelectingCartPage() {
  const { t, lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const gift = useGiftReceiver();
  const { status, authedRequest } = useAuthSession();
  const { items, extraSets, cartReady } = useCartData();
  const { addToCart, updateCartLine, removeFromCart } = useCartCommands();
  const { gallerySets, productsById } = useCartProductPresentation({
    items,
    language: lang,
    status,
    authedRequest,
  });
  const { summaryAnchorRef, summaryStackRef, mainColRef, summaryPinned, summaryBounds, summaryTop } =
    useCartSummarySticky(status);

  const [countries, setCountries] = useState<Country[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [pendingCourier, setPendingCourier] = useState<string | null>(null);
  const [promotedCourierCodes, setPromotedCourierCodes] = useState<Set<string>>(() => new Set());
  const [courierOverflowOpen, setCourierOverflowOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [pickupAddressInitial, setPickupAddressInitial] = useState<Partial<Address> | undefined>();
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receiverEmail, setReceiverEmail] = useState('');
  const [receiverEmailError, setReceiverEmailError] = useState<string | null>(null);
  const [cartRules, setCartRules] = useState<PublicCartRule[]>([]);
  const [cartAccessories, setCartAccessories] = useState<ProductById[]>([]);
  const [removal, setRemoval] = useState<CartItem | null>(null);

  const token = gift.token;
  const destination = gift.summary?.destination ?? null;
  const address = destination ? destinationAsAddress(destination) : null;
  const allowAccessories = gift.summary?.allowAccessories === true;
  const remainingAccessoryBudget = gift.summary?.remaining?.remainingAccessoryBudget ?? null;
  const selectedCourierCode = destination?.courierCode || pendingCourier || null;
  const selectedCourier = couriers.find((courier) => courier.code === selectedCourierCode);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void Promise.all([getReceiverAddressCountries(token), getReceiverCouriers(token)]).then(
      ([countryPayload, courierPayload]) => {
        if (cancelled) return;
        setCountries(countryPayload.countries);
        setCouriers(courierPayload.couriers);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, destination?.countryCode]);

  useEffect(() => {
    if (gift.hidePrices) {
      setCartRules([]);
      return;
    }
    let cancelled = false;
    void fetchCartRules(lang)
      .then((rules) => {
        if (!cancelled) setCartRules(rules);
      })
      .catch(() => {
        if (!cancelled) setCartRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gift.hidePrices, lang]);

  useEffect(() => {
    let cancelled = false;
    void fetchCartAccessories(lang)
      .then((products) => {
        if (!cancelled) {
          setCartAccessories(
            products.filter(
              (product) => product.accessoryType === 'byQuantity' || product.accessoryType === 'default',
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCartAccessories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const userItems = useMemo(
    () => items.filter((item) => item.origin !== 'rule' && item.locked !== true),
    [items],
  );

  const giftLines = useMemo(
    () =>
      items
        .filter((item) => item.origin === 'rule' || item.locked === true)
        .map((item) => ({ item, product: productsById[item.productId] }))
        .filter((line): line is { item: CartItem; product: ProductById } => !!line.product),
    [items, productsById],
  );

  const userAccessoryLines = useMemo(
    () =>
      userItems
        .map((item) => ({ item, product: productsById[item.productId] }))
        .filter(
          (line): line is { item: CartItem; product: ProductById } =>
            !!line.product && line.product.productType === 'accessory',
        )
        .sort((a, b) => a.product.title.localeCompare(b.product.title)),
    [productsById, userItems],
  );

  const cartedAccessoryProductIds = useMemo(
    () => new Set(userAccessoryLines.map(({ item }) => item.productId)),
    [userAccessoryLines],
  );
  const carouselAccessories = useMemo(
    () =>
      cartAccessories.filter((product) => {
        if (cartedAccessoryProductIds.has(product.id)) return false;
        if (typeof remainingAccessoryBudget !== 'number') return true;
        return accessoryFitsBudget(product, remainingAccessoryBudget);
      }),
    [cartAccessories, cartedAccessoryProductIds, remainingAccessoryBudget],
  );

  const lineGroups = useMemo(() => {
    const lines = userItems.flatMap((item) => {
      const set = gallerySets[item.productId];
      return set ? [{ item, set }] : [];
    });
    return groupCartLinesByShape(lines);
  }, [gallerySets, userItems]);

  const nailQty = useMemo(
    () => paidCatalogueSetQuantity(userItems) + extraSetUnitCount(extraSets),
    [extraSets, userItems],
  );
  const accessoryQty = useMemo(
    () => userAccessoryLines.reduce((sum, { item }) => sum + item.quantity, 0),
    [userAccessoryLines],
  );
  const totalQuantity = nailQty;
  // Catalogue sets. Qualifying extra-set rows join the same volume steps.
  const setQty = useMemo(() => paidCatalogueSetQuantity(userItems), [userItems]);
  const setSubtotal = useMemo(
    () =>
      lineGroups.reduce(
        (sum, group) =>
          sum +
          group.variants.reduce((lineSum, item) => {
            const price = typeof group.set.price === 'number' ? group.set.price : 0;
            return lineSum + price * item.quantity;
          }, 0),
        0,
      ),
    [lineGroups],
  );
  const nailQtyTier = gift.hidePrices
    ? null
    : previewNailQtyTier(
        cartRules,
        setQty,
        setSubtotal,
        extraSetPreviewUnits(extraSets).filter((entry) => entry.available),
      );
  const showRulesBlock = giftLines.length > 0 || (nailQtyTier != null && nailQtyTier.nailQty > 0);
  const showAccessories = carouselAccessories.length > 0 || userAccessoryLines.length > 0;

  const disabledCourierCodes = GIFT_DISABLED_COURIERS;
  const effectiveCountries = useMemo(
    () => (address?.countryCode ? [address.countryCode] : []),
    [address?.countryCode],
  );
  const courierOverflowOptions = useMemo(
    () =>
      buildCourierOverflowOptions(couriers, disabledCourierCodes, effectiveCountries, promotedCourierCodes),
    [couriers, disabledCourierCodes, effectiveCountries, promotedCourierCodes],
  );

  const promoteCourierCode = useCallback((code: string) => {
    setPromotedCourierCodes((current) => {
      if (current.has(code)) return current;
      const next = new Set(current);
      next.add(code);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!selectedCourierCode) return;
    const courier = couriers.find((item) => item.code === selectedCourierCode);
    if (!courier) return;
    if (
      courierOverflowTier(
        disabledCourierCodes.includes(courier.code),
        courier.countries,
        effectiveCountries,
      ) === 'overflow'
    ) {
      promoteCourierCode(courier.code);
    }
  }, [selectedCourierCode, couriers, disabledCourierCodes, effectiveCountries, promoteCourierCode]);

  const handleAddAsNewLine = useCallback(
    (
      item: CartItem,
      patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number }>,
    ) => {
      const set = gallerySets[item.productId];
      const shapeKey = patch.shapeKey ?? item.shapeKey;
      const lengthKey =
        patch.lengthKey ??
        (shapeKey === item.shapeKey || !set
          ? item.lengthKey
          : lengthAfterShapeChange(set, shapeKey, item.lengthKey));
      const size = patch.size ?? (item.size === '' ? 'M' : item.size);
      void addToCart(
        item.productId,
        shapeKey,
        lengthKey,
        size,
        {
          title: set?.title ?? '',
          photo: set?.photosByShapeLength[shapeKey]?.[lengthKey]?.[0]?.small ?? null,
          price: set?.price,
        },
        patch.quantity ?? 1,
        set ? availableQuantityFor(set.available, shapeKey, lengthKey, size) : Infinity,
        false,
      );
    },
    [addToCart, gallerySets],
  );

  const handleReplaceLine = useCallback(
    (
      item: CartItem,
      patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number }>,
    ) => {
      const set = gallerySets[item.productId];
      const resolved =
        patch.shapeKey !== undefined && patch.lengthKey === undefined && set
          ? { ...patch, lengthKey: lengthAfterShapeChange(set, patch.shapeKey, item.lengthKey) }
          : patch;
      void updateCartLine(item.productId, item.shapeKey, item.lengthKey, item.size, resolved);
    },
    [gallerySets, updateCartLine],
  );

  async function saveAddress(input: AddressInput) {
    if (!token) return;
    const nextCourier = selectedCourierCode || courierCodeMatchingAddress(input);
    gift.applySummary(await putReceiverDestination(token, addressInputToDestination(input, nextCourier)));
    if (nextCourier) setPendingCourier(nextCourier);
    setAddressOpen(false);
    setEditing(false);
    setPickupAddressInitial(undefined);
  }

  function courierCodeMatchingAddress(input: AddressInput): string {
    const address = {
      countryCode: input.countryCode,
      networkCodes: input.networkCodes && input.networkCodes.length > 0 ? input.networkCodes : ['home'],
      pickupPoints: input.pickupPoints ?? {},
    };
    return couriers.find((item) => courierCompatible(item, address))?.code || couriers[0]?.code || '';
  }

  function openPickupPointPicker() {
    setAddressOpen(false);
    setPickupAddressInitial(undefined);
    navigate(localizedPath('/account/addresses/mondial-relay', lang), {
      state: { returnTo: localizedPath('/cart', lang) },
    });
  }

  function openAddAddress() {
    const courier = couriers.find((item) => item.code === selectedCourierCode);
    if (courier?.code === shopConfig.mondialRelayPickerCourierCode) {
      openPickupPointPicker();
      return;
    }
    if (!courier) {
      setPickupAddressInitial({ networkCodes: ['home'] });
      setEditing(false);
      setAddressOpen(true);
      return;
    }
    const networkCodes = courier.networks.includes('home')
      ? ['home']
      : courier.networks.length
        ? courier.networks
        : ['home'];
    setPickupAddressInitial({ networkCodes });
    setEditing(false);
    setAddressOpen(true);
  }

  function selectMondialRelayPoint(point: PickupPoint) {
    setPickupAddressInitial({
      line1: point.line1,
      line2: point.line2 || null,
      postalCode: point.postalCode,
      city: point.city,
      countryCode: point.countryCode,
      networkCodes: [shopConfig.mondialRelayPickerNetworkCode],
      pickupPoints: {
        [shopConfig.mondialRelayPickerNetworkCode]: { id: point.id, name: point.name },
      },
    });
    setEditing(false);
    setAddressOpen(true);
  }

  useEffect(() => {
    const point = (location.state as { mondialRelayPoint?: PickupPoint } | null)?.mondialRelayPoint;
    if (!point) return;
    selectMondialRelayPoint(point);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  async function selectCourier(code: string) {
    setPendingCourier(code);
    if (!token || !destination) return;
    gift.applySummary(
      await putReceiverDestination(token, {
        ...destination,
        courierCode: code,
      }),
    );
  }

  function handleOverflowCourierPick(code: string) {
    setCourierOverflowOpen(false);
    promoteCourierCode(code);
    void selectCourier(code);
  }

  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiverEmail.trim());

  function validateReceiverEmail(): string | null {
    const trimmed = receiverEmail.trim();
    if (!trimmed) return t.gift.fieldRequired;
    if (!emailReady) return t.gift.fieldEmailInvalid;
    return null;
  }

  function requestConfirm() {
    const error = validateReceiverEmail();
    if (error) {
      setReceiverEmailError(error);
      return;
    }
    setReceiverEmailError(null);
    setConfirmOpen(true);
  }

  async function confirmChoice() {
    if (!token) return;
    const error = validateReceiverEmail();
    if (error) {
      setReceiverEmailError(error);
      setConfirmOpen(false);
      return;
    }
    setBusy(true);
    try {
      gift.applySummary(await confirmReceiverChoice(token, receiverEmail.trim()));
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = Boolean(token) && nailQty > 0 && destination != null;
  const giftPath = token ? `/gift/${token}` : '/cart';
  const showPage = cartReady;
  const remaining = gift.summary?.remaining;
  const hasPurchasableItems = nailQty + accessoryQty > 0;
  const noCourierFits =
    couriers.length > 0 && couriers.every((courier) => !pickCourierTier(courier, totalQuantity));
  const courierBlockNotice =
    !hasPurchasableItems || noCourierFits || selectedCourierCode ? null : t.cart.errorCourierRequired;
  const addressMatch =
    address && selectedCourier
      ? courierMatch(selectedCourier, address)
      : { countryOk: true, networkOk: true };
  const addressBlockNotice = !hasPurchasableItems
    ? null
    : !addressMatch.countryOk || !addressMatch.networkOk
      ? t.cart.addressDeselectedNotice
      : !address
        ? t.cart.errorAddressRequired
        : null;

  return (
    <section className={styles.section} aria-labelledby="gift-cart-h" data-testid="cart-page">
      <Seo title={t.cart.pageTitle} description={t.gift.receiverHello} path={giftPath} noindex />
      <div className={styles.titleGroup}>
        <h1 id="gift-cart-h" className={styles.title}>
          {t.cart.pageTitle}
        </h1>
      </div>

      {showPage && userItems.length === 0 && extraSets.length === 0 && (
        <div className={styles.empty}>
          <p>{t.gift.emptyBasket}</p>
          <Link to={localizedPath('/gallery', lang)} className={styles.emptyLink}>
            {t.cart.browseGalleryLink}
          </Link>
        </div>
      )}

      {showPage && (userItems.length > 0 || extraSets.length > 0) && (
        <div className={styles.layout}>
          <div ref={mainColRef} className={styles.mainCol}>
            <ul className={styles.list}>
              <PluginCartLines />
              {lineGroups.map(({ key, set, shapeKey, lengthKey, variants }) => (
                <CartLine
                  key={key}
                  set={set}
                  shapeKey={shapeKey}
                  lengthKey={lengthKey}
                  variants={variants}
                  t={t}
                  onUpdateQuantity={(item, quantity) =>
                    void updateCartLine(item.productId, item.shapeKey, item.lengthKey, item.size, {
                      quantity,
                    })
                  }
                  onAddAsNewLine={handleAddAsNewLine}
                  onReplaceLine={handleReplaceLine}
                  onReplaceGroupVariant={(axis, newKey, mode, resolvedLines) => {
                    const newShapeKey = axis === 'shape' ? newKey : shapeKey;
                    const newLengthKey =
                      axis === 'shape' ? lengthAfterShapeChange(set, newKey, lengthKey) : newKey;
                    for (const item of variants) {
                      const resolved = resolvedLines.find((line) => line.originalSize === item.size);
                      if (!resolved) continue;
                      const patch = {
                        shapeKey: newShapeKey,
                        lengthKey: newLengthKey,
                        size: resolved.newSize as Size,
                        quantity: resolved.quantity,
                      };
                      if (mode === 'new') handleAddAsNewLine(item, patch);
                      else handleReplaceLine(item, patch);
                    }
                  }}
                  onRequestRemoval={(item) => setRemoval(item)}
                  onRemoveVariant={(item) =>
                    void removeFromCart(item.productId, item.shapeKey, item.lengthKey, item.size)
                  }
                  onDeleteGroup={() => {
                    for (const item of variants) {
                      void removeFromCart(item.productId, item.shapeKey, item.lengthKey, item.size);
                    }
                  }}
                  onMoveGroupToWishlist={() => undefined}
                  canMoveToWishlist={false}
                  isWishlistCart={false}
                />
              ))}
            </ul>

            {showRulesBlock && (
              <div className={styles.rulesSection}>
                <ul className={styles.list}>
                  {giftLines.map(({ item, product }) => (
                    <AccessoryCartLine
                      key={`gift-${item.productId}`}
                      product={product}
                      item={item}
                      t={t}
                      hidePrices={gift.hidePrices}
                      onUpdateQuantity={() => undefined}
                      onRequestRemoval={() => undefined}
                      onDelete={() => Promise.resolve()}
                    />
                  ))}
                  {nailQtyTier && nailQtyTier.nailQty > 0 && <CartRulesProgress tier={nailQtyTier} t={t} />}
                </ul>
              </div>
            )}

            {showAccessories && (
              <section
                className={
                  userAccessoryLines.length > 0
                    ? styles.addAccessoriesSection
                    : `${styles.addAccessoriesSection} ${styles.addAccessoriesSectionNoLines}`
                }
                aria-labelledby="gift-cart-add-accessories-h"
              >
                <h2 id="gift-cart-add-accessories-h" className={styles.sectionTitle}>
                  {t.cart.addAccessoriesHeading}
                </h2>
                <CartAccessoryCarousel products={carouselAccessories} />
                {userAccessoryLines.length > 0 ? (
                  <ul className={styles.addAccessoriesLines}>
                    {userAccessoryLines.map(({ item, product }) => (
                      <AccessoryCartLine
                        key={`${item.productId}-${item.packKey ?? ''}`}
                        product={product}
                        item={item}
                        t={t}
                        hidePrices={gift.hidePrices}
                        budgetRemaining={remainingAccessoryBudget}
                        onUpdateQuantity={(quantity) =>
                          void updateCartLine(item.productId, item.shapeKey, item.lengthKey, item.size, {
                            quantity,
                          })
                        }
                        onChangePackKey={(packKey) => {
                          const max = packQtyMax(product, packKey);
                          void updateCartLine(item.productId, item.shapeKey, item.lengthKey, item.size, {
                            packKey,
                            quantity: Math.min(item.quantity, max),
                          });
                        }}
                        onRequestRemoval={() => setRemoval(item)}
                        onDelete={() =>
                          removeFromCart(item.productId, item.shapeKey, item.lengthKey, item.size)
                        }
                      />
                    ))}
                  </ul>
                ) : null}
              </section>
            )}

            <CartCourierSection
              t={t}
              couriers={couriers}
              disabledCourierCodes={disabledCourierCodes}
              effectiveCountries={effectiveCountries}
              promotedCourierCodes={promotedCourierCodes}
              selectedCourierCode={selectedCourierCode}
              defaultCourierCode={null}
              totalQuantity={totalQuantity}
              shippingCountryCode={address?.countryCode}
              express={false}
              cartRules={gift.hidePrices ? [] : cartRules}
              francoMerchandise={0}
              freeShipping={null}
              noCourierFits={noCourierFits}
              blockNotice={courierBlockNotice}
              // Julie never sees courier fees (even when gallery prices are
              // visible), so this also suppresses shippingPricePending.
              hidePrices
              onOpenOverflowModal={() => setCourierOverflowOpen(true)}
              onSelectCourier={(code) => void selectCourier(code)}
              onExpressChange={() => undefined}
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
              title={t.gift.destinationTitle}
              addresses={address ? [address] : []}
              countries={countries}
              couriers={couriers}
              selectedAddressId={address?.id ?? null}
              radioName="gift-destination"
              optionTestId="cart-address-option"
              addTestId="gift-add-address"
              selectedCourier={selectedCourier}
              blockNotice={addressBlockNotice}
              onSelect={() => undefined}
              onEdit={() => {
                setPickupAddressInitial(undefined);
                setEditing(true);
                setAddressOpen(true);
              }}
              onDelete={() => undefined}
              onAdd={openAddAddress}
            />
          </div>

          <aside ref={summaryAnchorRef} className={styles.summaryCol}>
            <div
              ref={summaryStackRef}
              className={[styles.summaryStack, summaryPinned ? styles.summaryStackPinned : '']
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
              <GiftOrderSummary
                t={t}
                giverDisplayName={gift.summary?.giverDisplayName ?? ''}
                giverComment={gift.summary?.giverComment ?? null}
                remainingBudget={remaining?.remainingBudget ?? null}
                remainingAccessoryBudget={remaining?.remainingAccessoryBudget ?? null}
                hidePrices={gift.hidePrices}
                allowAccessories={allowAccessories}
                canConfirm={canConfirm}
                emailReady={emailReady}
                alreadyConfirmed={false}
                confirmedNotice={false}
                busy={busy}
                receiverEmail={receiverEmail}
                receiverEmailError={receiverEmailError}
                onReceiverEmailChange={(value) => {
                  setReceiverEmail(value);
                  if (receiverEmailError) setReceiverEmailError(null);
                }}
                onConfirm={requestConfirm}
              />
            </div>
          </aside>
        </div>
      )}

      {addressOpen && (
        <AddressFormModal
          t={t}
          countries={countries}
          kind="livraison"
          {...(editing && address
            ? { initial: address }
            : pickupAddressInitial
              ? { initial: pickupAddressInitial }
              : {})}
          title={editing ? t.address.editLivraisonTitle : t.address.addLivraisonButton}
          submitLabel={t.gift.saveDestination}
          allowOneTimeUse
          allowRemember={false}
          onSubmit={saveAddress}
          {...(!editing && !selectedCourierCode ? { onChoosePickup: openPickupPointPicker } : {})}
          onClose={() => {
            setAddressOpen(false);
            setEditing(false);
            setPickupAddressInitial(undefined);
          }}
        />
      )}

      {removal && (
        <FavoriteOrRemoveModal
          t={t}
          title={t.cart.lastUnitTitle}
          text={t.cart.lastUnitText}
          preview={
            gallerySets[removal.productId] ? (
              <ItemPreviewRow
                photo={
                  gallerySets[removal.productId]!.photosByShapeLength[removal.shapeKey]?.[
                    removal.lengthKey
                  ]?.[0]?.small ?? null
                }
                alt={gallerySets[removal.productId]!.title}
                title={gallerySets[removal.productId]!.title}
                shapeLabel={gallerySets[removal.productId]!.shape[removal.shapeKey] ?? ''}
                lengthLabel={
                  gallerySets[removal.productId]!.lengthsByShape[removal.shapeKey]?.[removal.lengthKey] ??
                  removal.lengthKey
                }
                sizeLabels={removal.size ? [removal.size] : []}
                enlarged
              />
            ) : productsById[removal.productId] ? (
              <ItemPreviewRow
                photo={accessoryLinePhoto(productsById[removal.productId]!, removal.packKey ?? '')}
                alt={productsById[removal.productId]!.title}
                title={productsById[removal.productId]!.title}
                shapeLabel=""
                sizeLabels={[]}
                enlarged
              />
            ) : null
          }
          onRemove={() => {
            void removeFromCart(removal.productId, removal.shapeKey, removal.lengthKey, removal.size);
            setRemoval(null);
          }}
          onCancel={() => setRemoval(null)}
        />
      )}

      {confirmOpen && (
        <ConfirmModal
          title={t.gift.confirmTitle}
          message={t.gift.confirmBody}
          confirmLabel={t.gift.confirmCta}
          closeLabel={t.auth.closeAria}
          onConfirm={() => void confirmChoice()}
          onCancel={() => setConfirmOpen(false)}
          variant="dialog"
        />
      )}

      {busy && <LoadingModal message={t.gift.confirming} />}
    </section>
  );
}
