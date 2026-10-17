import { useEffect, useMemo, useState } from 'react';
import { audienceForStatus, seedProducts } from '../../state/productCache';
import { fetchCartRules, fetchCartAccessories, type ProductById } from '../../api/gallery';
import { type CartComposition, type CartItem } from '../../api/cart';
import { paidNailSetQuantity } from '../../utils/composition';
import type { GalleryItem } from '../../data/types';
import { groupCartLinesByShape } from '../../utils/groupCartLines';
import { availableQuantityFor } from '../../utils/availability';
import { accessoryLineTotal, packQtyMax } from '../../utils/accessoryPacks';
import { preferredLanguage } from '../../assets/i18n/languagePreference';
import { type PublicCartRule } from '../../utils/cartRulesPreview';
import type { Lang } from '../../assets/i18n/types';
import type { AuthStatus } from '../../state/AuthContext';

/** Cart rules, accessory catalogue, and derived line groups / totals. */
export function useShopCartCatalog(args: {
  items: CartItem[];
  compositions?: CartComposition[];
  gallerySets: Record<string, GalleryItem>;
  productsById: Record<string, ProductById>;
  isGiftCart: boolean;
  lang: Lang;
  status: AuthStatus;
}) {
  const { items, compositions = [], gallerySets, productsById, isGiftCart, lang, status } = args;
  const [cartRules, setCartRules] = useState<PublicCartRule[]>([]);
  const [cartAccessories, setCartAccessories] = useState<ProductById[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCartRules(preferredLanguage())
      .then((rules) => {
        if (!cancelled) setCartRules(rules);
      })
      .catch(() => {
        if (!cancelled) setCartRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    fetchCartAccessories(preferredLanguage())
      .then((accessoryItems) => {
        if (!cancelled) {
          // Feed the shared cache: adding one of these to the cart is then a
          // pure cache hit, so neither this page nor the drawer refetches it.
          const audience = audienceForStatus(status);
          if (audience) seedProducts(preferredLanguage(), audience, { products: accessoryItems });
          // Explicit whitelist, not a blanket pass-through: a future
          // accessoryType the cart page doesn't yet know how to render
          // must stay out of the carousel until it's actually handled here.
          setCartAccessories(
            accessoryItems.filter(
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
  }, [lang, status]);

  // One memo for the whole cart derivation. Everything below reads exactly
  // four values (items, gallerySets, productsById, cartAccessories) and
  // every helper it calls (groupCartLinesByShape, availableQuantityFor,
  // packQtyMax, accessoryLineTotal) is a module-level import, so the
  // dependency list here is provably complete rather than hand-curated.
  //
  // Unmemoized this ran on all 36 of this route's state changes: two
  // map+filter passes over the cart, a localeCompare sort, four filters, a
  // Set build, eight reduces and groupCartLinesByShape, to recompute a
  // subtotal that only moves when the cart or the catalogue does. It also
  // handed CartLine a fresh `variants` array every render, which is why
  // memoizing that component would previously have bought nothing.
  const {
    nailLines,
    giftLines,
    userAccessoryLines,
    carouselAccessories,
    subtotal,
    tierTotals,
    nailQty,
    accessoryQty,
    totalQuantity,
    giftQty,
    itemCounts,
    paidItemsQty,
    hasPurchasableItems,
    hasOutOfStockItems,
    cartFingerprint,
    lineGroups,
  } = useMemo(() => {
    const nailLines = items
      .map((item) => ({ item, set: gallerySets[item.productId] }))
      .filter((line): line is { item: (typeof items)[number]; set: GalleryItem } => !!line.set);
    const allAccessoryLines = items
      .map((item) => ({ item, product: productsById[item.productId] }))
      .filter(
        (line): line is { item: (typeof items)[number]; product: ProductById } =>
          !!line.product && line.product.productType === 'accessory',
      )
      // Cart order otherwise follows add order. Alphabetical by product
      // title reads as a stable, predictable list instead (same as
      // groupCartLinesByShape for the nail cards above).
      .sort((a, b) => a.product.title.localeCompare(b.product.title));
    const giftLines = allAccessoryLines.filter(({ item }) => item.origin === 'rule');
    const userAccessoryLines = allAccessoryLines.filter(({ item }) => item.origin !== 'rule');
    // Once a carousel accessory is added to the cart, it moves into the list
    // below the carousel, regardless of type, so 'default' and 'byQuantity'
    // lines land in the same place instead of one showing up back in the main
    // item list where a byQuantity line never would. Drop it from the
    // carousel itself so it isn't offered twice; removing it from the cart
    // (or dropping its quantity to 0) naturally brings it back here.
    const cartedAccessoryProductIds = new Set(userAccessoryLines.map(({ item }) => item.productId));
    const carouselAccessories = cartAccessories.filter(
      (product) => !cartedAccessoryProductIds.has(product.id),
    );

    function quantityForLine(item: CartItem): number {
      if (item.locked || item.origin === 'rule' || isGiftCart) return item.quantity;
      const product = productsById[item.productId];
      if (product?.productType === 'accessory' && typeof product.available === 'number') {
        return Math.min(item.quantity, packQtyMax(product, item.packKey ?? ''));
      }
      const set = gallerySets[item.productId];
      if (!set || item.size === '') return 0;
      return Math.min(
        item.quantity,
        availableQuantityFor(set.available, item.shapeKey, item.lengthKey, item.size),
      );
    }

    // CartLine displays a quantity capped to the current stock. Use that same
    // quantity here so an unavailable line contributes neither price nor a
    // phantom package to checkout.
    const availableNailLines = nailLines.map(({ item, set }) => ({
      item,
      set,
      quantity: quantityForLine(item),
    }));
    const availableAccessoryLines = [...userAccessoryLines, ...giftLines].map(({ item, product }) => ({
      item,
      product,
      quantity: quantityForLine(item),
      isGift: item.origin === 'rule',
    }));
    // Catalogue nail sets. previewNailQtyTier adds composed sets that meet
    // the rule's minimum nail count, and discounts those line totals too.
    const setSubtotal = availableNailLines.reduce(
      (sum, { quantity, set, item }) => (item.origin === 'rule' ? sum : sum + (set.price ?? 0) * quantity),
      0,
    );
    const setQty = paidNailSetQuantity(
      availableNailLines.map(({ item, quantity }) => ({ ...item, quantity })),
      [],
    );
    const nailSubtotal =
      setSubtotal +
      compositions
        .filter((entry) => entry.available)
        .reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);
    const accessorySubtotal = availableAccessoryLines.reduce(
      (sum, { quantity, product, item, isGift }) =>
        isGift ? sum : sum + (accessoryLineTotal(product, item.packKey ?? '', quantity) ?? 0),
      0,
    );
    const subtotal = nailSubtotal + accessorySubtotal;
    const nailQty = paidNailSetQuantity(
      availableNailLines.map(({ item, quantity }) => ({ ...item, quantity })),
      compositions,
    );
    const accessoryQty = availableAccessoryLines.filter((l) => !l.isGift).reduce((s, l) => s + l.quantity, 0);
    const giftQty = availableAccessoryLines.filter((l) => l.isGift).reduce((s, l) => s + l.quantity, 0);
    // Checkout sizes the courier packet from nail-set quantity only.
    // Accessories and rule gifts ride in the parcel but count as 0, so they
    // cannot move the order into a higher commercial tier.
    const totalQuantity = nailQty;
    // Shown as separate lines above the total in every payment confirm
    // dialog (see ConfirmItemsCountSummary): nail sets, accessories and
    // gift/free items kept apart rather than one combined count.
    const paidItemsQty = nailQty + accessoryQty;
    const hasPurchasableItems = paidItemsQty > 0;
    // Payment confirmation rows: a composed set is its own kind, never a
    // catalogue set (nailQty above still counts both, for the packet size).
    const itemCounts = { nailQty: setQty, compositionQty: nailQty - setQty, accessoryQty, giftQty };
    // At least one line is clamped to 0 (out of stock). Shown as a reminder
    // in the payment confirmation dialogs that it'll be dropped from the
    // order, never a reason to block checkout for the lines that do fit.
    const hasOutOfStockItems =
      availableNailLines.some(({ quantity }) => quantity === 0) ||
      availableAccessoryLines.some(({ quantity, isGift }) => !isGift && quantity === 0);
    const cartFingerprint = items
      .filter((item) => item.origin !== 'rule')
      .map(
        (item) =>
          `${item.productId}:${item.shapeKey}:${item.lengthKey}:${item.size}:${item.packKey ?? ''}:${item.quantity}`,
      )
      .sort()
      .join('|');

    // One CartLine card per set+shape. Size lines are rows inside the card
    // (see groupCartLinesByShape / CartLine).
    const lineGroups = groupCartLinesByShape(nailLines);
    return {
      nailLines,
      giftLines,
      userAccessoryLines,
      carouselAccessories,
      subtotal,
      tierTotals: { qty: setQty, subtotal: setSubtotal },
      nailQty,
      accessoryQty,
      totalQuantity,
      giftQty,
      itemCounts,
      paidItemsQty,
      hasPurchasableItems,
      hasOutOfStockItems,
      cartFingerprint,
      lineGroups,
    };
  }, [compositions, items, gallerySets, productsById, cartAccessories, isGiftCart]);

  // User-added nails + accessories only. Gift/rule lines still render inside
  // checkout when there is something to pay for, but they must not keep the
  // page in checkout mode after the last paid line is gone (orphan kit +
  // shipping fee).
  const userLinesCount = isGiftCart
    ? nailLines.filter(({ item }) => item.origin !== 'rule').length +
      userAccessoryLines.length +
      compositions.length
    : nailLines.filter(({ item }) => item.locked !== true && item.origin !== 'rule').length +
      userAccessoryLines.length +
      compositions.length;

  return {
    cartRules,
    cartAccessories,
    nailLines,
    giftLines,
    userAccessoryLines,
    carouselAccessories,
    subtotal,
    tierTotals,
    nailQty,
    accessoryQty,
    totalQuantity,
    giftQty,
    itemCounts,
    paidItemsQty,
    hasPurchasableItems,
    hasOutOfStockItems,
    cartFingerprint,
    lineGroups,
    userLinesCount,
  };
}
