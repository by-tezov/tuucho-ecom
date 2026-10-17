import * as cartApi from '../api/cart';
import * as accountApi from '../api/account';
import * as checkoutApi from '../api/checkout';
import * as favoritesApi from '../api/favorites';
import type { CartItem, CartSummary, GuestImportSelection } from '../api/cart';
import type { AddressInput } from '../api/account';
import type { DefaultPaymentMethod } from '../api/checkout';
import { UNCONNECTED_CART_SENTINEL } from '../utils/cartDisplayName';
import { clearGuestState, guestCompositionImportPayload, hasGuestData, loadGuestState } from './guestCart';
import { addEphemeralCard, removeEphemeralCard } from './ephemeralCards';
import { addEphemeralAddress, removeEphemeralAddress } from './ephemeralAddresses';
import {
  clearGuestCards,
  flushGuestCheckoutVault,
  loadGuestAddressState,
  loadGuestCards,
  saveGuestAddressState,
  saveGuestCards,
} from './guestCardVault';
import { parkGuestComposeDraftForSignIn } from './galleryNailEditSession';
import { cardComment } from '../utils/cartComment';

const PENDING_VOUCHER_KEY = 'psn-pending-voucher';

export interface GuestCartMergeChoice {
  carts: CartSummary[];
  cartLimit: number;
  items: CartItem[];
  compositions: ReturnType<typeof guestCompositionImportPayload>;
  selection: GuestImportSelection;
  /** Remapped after address create — payment default id if any. */
  defaultPaymentMethod: DefaultPaymentMethod | null;
}

export type GuestMergeResult =
  { status: 'done' } | { status: 'needs_cart_choice'; choice: GuestCartMergeChoice };

/** Syncs favorites, addresses, and payment methods from guest storage.
 * Cart lines are either imported automatically (no existing account carts)
 * or deferred via `needs_cart_choice` so the UI can ask create-vs-merge.
 *
 * Called from AuthContext's login/register before `applySession` when no
 * dialog is needed; when a choice is required, AuthContext holds the
 * session until `completeGuestCartMerge` finishes. */
export async function mergeGuestStateIntoAccount(
  accessToken: string,
  options?: { attachRememberedCheckout?: boolean },
): Promise<GuestMergeResult> {
  // Address/card state is encrypted asynchronously. Never race a just-added
  // guest checkout detail with a login/register click.
  await flushGuestCheckoutVault();
  parkGuestComposeDraftForSignIn();
  // Remembered guest checkout (savedForFuture / remember card) waits for the
  // manage-order token. Independent login onto an existing account must not
  // copy those leftovers — only a brand-new register may import them.
  const attachRemembered = options?.attachRememberedCheckout === true;
  const guestState = loadGuestState();
  const [guestCards, guestAddressState] = await Promise.all([loadGuestCards(), loadGuestAddressState()]);
  const hasCards = guestCards.paymentMethods.length > 0 || !!guestCards.defaultPaymentMethod;
  if (!hasGuestData(guestState) && guestAddressState.addresses.length === 0 && !hasCards)
    return { status: 'done' };

  // Guest favorites store the variant as "<shapeKey>::<lengthKey>" — see
  // useGalleryFavorites.tsx's encodeVariant.
  for (const [productId, variant] of Object.entries(guestState.favorites)) {
    const separator = variant.indexOf('::');
    const shapeKey = separator === -1 ? variant : variant.slice(0, separator);
    const lengthKey = separator === -1 ? '' : variant.slice(separator + 2);
    try {
      await favoritesApi.upsertFavorite(accessToken, productId, shapeKey, lengthKey);
    } catch {
      // best-effort
    }
  }

  let selectedAddressId: string | null = null;
  let selectedBillingAddressId: string | null = null;
  const migratedGuestAddressIds: string[] = [];
  for (const guestAddress of guestAddressState.addresses) {
    try {
      const savedForFuture = guestAddress.savedForFuture !== false;
      if (savedForFuture && !attachRemembered) continue;
      const input: AddressInput = {
        kind: guestAddress.kind,
        line1: guestAddress.line1,
        postalCode: guestAddress.postalCode,
        city: guestAddress.city,
        countryCode: guestAddress.countryCode,
        networkCodes: guestAddress.networkCodes,
        pickupPoints: guestAddress.pickupPoints,
        isDefault: savedForFuture ? guestAddress.isDefault : false,
        savedForFuture,
        ...(guestAddress.label ? { label: guestAddress.label } : {}),
        ...(guestAddress.recipientName ? { recipientName: guestAddress.recipientName } : {}),
        ...(guestAddress.companyName ? { companyName: guestAddress.companyName } : {}),
        ...(guestAddress.line2 ? { line2: guestAddress.line2 } : {}),
        ...(guestAddress.deliveryNotes ? { deliveryNotes: guestAddress.deliveryNotes } : {}),
        ...(guestAddress.phone ? { phone: guestAddress.phone } : {}),
      };
      const { address } = await accountApi.createAddress(accessToken, input);
      // Drop the guest-uuid ephemeral copy (if any) so remounts don't show a
      // duplicate that setCheckoutSelection cannot own.
      removeEphemeralAddress(guestAddress.id);
      if (!savedForFuture) addEphemeralAddress(address);
      migratedGuestAddressIds.push(guestAddress.id);
      if (guestAddress.id === guestAddressState.selectedAddressId) selectedAddressId = address.id;
      if (guestAddress.id === guestAddressState.selectedBillingAddressId)
        selectedBillingAddressId = address.id;
    } catch {
      // Keep this guest address in the vault for a later retry — do not clear
      // the whole vault below when any migration fails.
    }
  }
  const paymentMethodIdMap = new Map<string, string>();
  const migratedGuestCardIds: string[] = [];
  for (const method of guestCards.paymentMethods) {
    try {
      const savedForFuture = method.savedForFuture !== false;
      if (savedForFuture && !attachRemembered) continue;
      const { paymentMethod } = await checkoutApi.attachPaymentMethod(accessToken, method.id, savedForFuture);
      // The returned id is the one checkout selection must keep (Stripe may
      // replace a SetupIntent pm_ with the attached one).
      paymentMethodIdMap.set(method.id, paymentMethod.id);
      removeEphemeralCard(method.id);
      if (!savedForFuture) addEphemeralCard(paymentMethod);
      migratedGuestCardIds.push(method.id);
    } catch {
      // Keep this guest card in the vault for a later retry.
    }
  }
  if (guestCards.defaultPaymentMethod?.type === 'card') {
    const defaultId = guestCards.defaultPaymentMethod.id;
    const remappedDefaultId = paymentMethodIdMap.get(defaultId) ?? defaultId;
    // Only promote remembered cards to the account default.
    const defaultIsSaved =
      guestCards.paymentMethods.find((m) => m.id === defaultId)?.savedForFuture !== false;
    if (defaultIsSaved && attachRemembered) {
      try {
        await checkoutApi.setDefaultPaymentMethod(accessToken, { type: 'card', id: remappedDefaultId });
      } catch {
        // best-effort
      }
    }
  } else if (guestCards.defaultPaymentMethod) {
    try {
      await checkoutApi.setDefaultPaymentMethod(accessToken, guestCards.defaultPaymentMethod);
    } catch {
      // best-effort
    }
  }

  const selection: GuestImportSelection = {
    addressId: selectedAddressId,
    billingAddressId: selectedBillingAddressId,
    sameAsBilling: guestAddressState.sameAsBilling,
    courierCode: guestState.courierCode,
    express: guestState.express,
    paymentMethodId:
      guestCards.defaultPaymentMethod?.type === 'card'
        ? (paymentMethodIdMap.get(guestCards.defaultPaymentMethod.id) ?? guestCards.defaultPaymentMethod.id)
        : guestCards.defaultPaymentMethod?.type === 'paypal' ||
            guestCards.defaultPaymentMethod?.type === 'bancontact' ||
            guestCards.defaultPaymentMethod?.type === 'google_pay' ||
            guestCards.defaultPaymentMethod?.type === 'apple_pay'
          ? guestCards.defaultPaymentMethod.type
          : null,
    voucherCode: guestState.voucherCode,
  };

  const items: CartItem[] = guestState.cart.map((line) => {
    const comment = cardComment(guestState.cart, line);
    return {
      productId: line.productId,
      shapeKey: line.shapeKey,
      lengthKey: line.lengthKey,
      size: line.size,
      packKey: line.packKey ?? '',
      quantity: line.quantity,
      ...(comment ? { comment } : {}),
    };
  });
  const compositions = guestCompositionImportPayload(guestState.compositions);

  const hasCartPayload =
    items.length > 0 ||
    compositions.length > 0 ||
    !!(selection.courierCode || selection.addressId || selection.voucherCode);

  if (!hasCartPayload) {
    await pruneMigratedGuestCheckout(migratedGuestAddressIds, migratedGuestCardIds);
    clearGuestState();
    return { status: 'done' };
  }

  let accountCarts: CartSummary[];
  let cartLimit = 10;
  // Do not guess that the account has no carts when this read fails. The
  // rejection must reach AuthContext, otherwise we could create a new active
  // cart and clear the only local copy.
  const listed = await cartApi.listCarts(accessToken);
  accountCarts = listed.carts;
  cartLimit = listed.cartLimit ?? 10;

  // A still-empty default cart (the common case: an account that's never
  // actually used the cart, only its lazily-created default) is not a real
  // choice — merge straight into it, same as the no-carts case below,
  // instead of asking create-vs-merge when there's nothing in the account's
  // main cart to conflict with, even if other named carts exist alongside it.
  const defaultCart = accountCarts.find((cart) => cart.kind === 'default');
  const emptyDefaultCart = defaultCart && defaultCart.itemCount === 0 ? defaultCart : undefined;

  if (accountCarts.length === 0 || emptyDefaultCart) {
    try {
      await cartApi.importGuestCart(
        accessToken,
        emptyDefaultCart
          ? { mode: 'merge', targetCartId: emptyDefaultCart.id, items, compositions, selection }
          : { mode: 'new', items, compositions, selection },
      );
    } catch {
      // Fall back only when every line and the checkout selection succeed.
      // Otherwise retain guest state so the caller can retry safely.
      let fallbackSucceeded = true;
      for (const line of items) {
        try {
          await cartApi.addToCart(
            accessToken,
            line.productId,
            line.shapeKey,
            line.lengthKey,
            line.size,
            line.quantity,
            line.packKey ?? '',
          );
        } catch {
          fallbackSucceeded = false;
        }
      }
      try {
        await checkoutApi.setCheckoutSelection(accessToken, {
          addressId: selection.addressId ?? null,
          courierCode: selection.courierCode ?? null,
          express: selection.express === true,
          billingAddressId: selection.billingAddressId ?? null,
          sameAsBilling: selection.sameAsBilling !== false,
          paymentMethodId: selection.paymentMethodId ?? null,
          voucherCode: selection.voucherCode ?? null,
        });
      } catch {
        fallbackSucceeded = false;
      }
      if (!fallbackSucceeded) {
        throw new Error('guest_cart_import_failed');
      }
    }
    if (guestState.voucherCode && typeof window !== 'undefined') {
      window.sessionStorage.setItem(PENDING_VOUCHER_KEY, guestState.voucherCode);
    }
    await pruneMigratedGuestCheckout(migratedGuestAddressIds, migratedGuestCardIds);
    clearGuestState();
    return { status: 'done' };
  }

  // Account already has carts — UI must choose create vs merge. Address/card
  // migration already ran; prune successes from the vault so a remount cannot
  // lose one-time items that only live in session ephemeral now.
  await pruneMigratedGuestCheckout(migratedGuestAddressIds, migratedGuestCardIds);
  return {
    status: 'needs_cart_choice',
    choice: {
      carts: accountCarts,
      cartLimit,
      items,
      compositions,
      selection,
      defaultPaymentMethod: guestCards.defaultPaymentMethod,
    },
  };
}

/** Drop guest-vault address/card rows that were successfully attached to the
 * account. Leaves failures in place for a later retry instead of wiping the
 * only local copy (which used to make one-time checkout details vanish after
 * OTP when create/attach had silently failed). */
async function pruneMigratedGuestCheckout(
  migratedGuestAddressIds: string[],
  migratedGuestCardIds: string[],
): Promise<void> {
  if (migratedGuestAddressIds.length === 0 && migratedGuestCardIds.length === 0) {
    // Nothing migrated — either there was nothing to migrate, or everything
    // failed. Only clear when the vault is already empty of checkout details.
    const [cards, addressState] = await Promise.all([loadGuestCards(), loadGuestAddressState()]);
    if (
      cards.paymentMethods.length === 0 &&
      !cards.defaultPaymentMethod &&
      addressState.addresses.length === 0
    ) {
      clearGuestCards();
    }
    return;
  }

  const [cards, addressState] = await Promise.all([loadGuestCards(), loadGuestAddressState()]);
  const remainingAddresses = addressState.addresses.filter((a) => !migratedGuestAddressIds.includes(a.id));
  const remainingCards = cards.paymentMethods.filter((m) => !migratedGuestCardIds.includes(m.id));
  let nextDefault = cards.defaultPaymentMethod;
  if (nextDefault?.type === 'card') {
    const defaultCardId = nextDefault.id;
    if (migratedGuestCardIds.includes(defaultCardId) || !remainingCards.some((m) => m.id === defaultCardId)) {
      nextDefault = null;
    }
  }

  if (remainingAddresses.length === 0 && remainingCards.length === 0 && !nextDefault) {
    clearGuestCards();
    return;
  }

  await saveGuestCards({ paymentMethods: remainingCards, defaultPaymentMethod: nextDefault });
  await saveGuestAddressState({
    addresses: remainingAddresses,
    selectedAddressId: remainingAddresses.some((a) => a.id === addressState.selectedAddressId)
      ? addressState.selectedAddressId
      : (remainingAddresses.find((a) => a.kind === 'livraison')?.id ?? null),
    selectedBillingAddressId: remainingAddresses.some((a) => a.id === addressState.selectedBillingAddressId)
      ? addressState.selectedBillingAddressId
      : null,
    sameAsBilling: addressState.sameAsBilling,
  });
}

/** Finishes a deferred guest cart import after the user picks create/merge. */
export async function completeGuestCartMerge(
  accessToken: string,
  choice: GuestCartMergeChoice,
  mode: 'new' | 'merge',
  targetCartId?: string,
  name?: string,
): Promise<void> {
  const trimmed = name?.trim();
  await cartApi.importGuestCart(accessToken, {
    mode,
    items: choice.items,
    compositions: choice.compositions,
    selection: choice.selection,
    ...(targetCartId ? { targetCartId } : {}),
    // Default English sentinel — UI maps via cartDisplayName → t.cart.guestCartName.
    ...(mode === 'new' ? { name: trimmed || UNCONNECTED_CART_SENTINEL } : {}),
  });
  if (choice.selection.voucherCode && typeof window !== 'undefined') {
    window.sessionStorage.setItem(PENDING_VOUCHER_KEY, choice.selection.voucherCode);
  }
  clearGuestState();
  clearGuestCards();
}

/** Closing the merge dialog is "decide later", not "throw my cart away": the
 * lines are parked in the account's single Unconnected cart. That cart is a
 * system cart — outside the cart limit, so this always succeeds, and a second
 * close merges into the same one instead of piling up copies. It stays
 * inactive, so the customer keeps the cart they logged into. */
export async function parkGuestCartAsUnconnected(
  accessToken: string,
  choice: GuestCartMergeChoice,
): Promise<void> {
  await cartApi.importGuestCart(accessToken, {
    mode: 'unconnected',
    items: choice.items,
    compositions: choice.compositions,
    selection: choice.selection,
  });
  clearGuestState();
  clearGuestCards();
}

/** Read-once — CartPage's load effect calls this after a fresh login to
 * pre-fill the promo code input left over from mergeGuestStateIntoAccount
 * above, without leaving it around to resurface on some unrelated later
 * session. */
export function takePendingVoucherCode(): string | null {
  if (typeof window === 'undefined') return null;
  const code = window.sessionStorage.getItem(PENDING_VOUCHER_KEY);
  if (code) window.sessionStorage.removeItem(PENDING_VOUCHER_KEY);
  return code;
}
