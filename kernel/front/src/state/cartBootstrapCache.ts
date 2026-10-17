import { shopConfig } from '../config/env';
import type { CacheAudience } from './productCache';
import type { DeliveryBootstrap } from './cartDeliveryBootstrap';
import type { PaymentBootstrap } from './cartPaymentBootstrap';
import type { WalletAvailability } from '../hooks/useWalletAvailability';

/**
 * Tab-scoped, memory-only cache for the cart page Phase B snapshot
 * (addresses, couriers, payment methods, wallet probe).
 *
 * Same lifetime policy as productCache: never sessionStorage or localStorage.
 * A refresh, new tab, or reopening the browser always starts cold. Guest
 * card/address ciphertext stays in guestCardVault with a RAM-only AES key —
 * this module must not become a plaintext persistence path for pm_… ids.
 *
 * Not a source of truth: checkout APIs remain authoritative; this only
 * avoids re-blocking the UI on Galerie ↔ Panier navigation while the SPA
 * session is still warm (see cartPageCacheTtlMs).
 */

export type CartBootstrapData = {
  generation: string;
  /** Bumped on silent revalidate so CartPage can soft-merge without remount. */
  revision: number;
  delivery: DeliveryBootstrap;
  payment: PaymentBootstrap;
  walletAvailability: WalletAvailability;
  guestCheckoutReady: boolean;
};

interface CacheEntry {
  generation: string;
  audience: CacheAudience;
  data: CartBootstrapData;
  fetchedAt: number;
}

let entry: CacheEntry | null = null;
/** Last user/app activity in this tab — drives idle cold start. */
let lastSpaActivityAt = 0;

/**
 * Address and payment method ids the customer explicitly deleted in this tab.
 * Cart edits only touch React state, so without this the snapshot above (or a
 * revalidate that raced the delete) repaints the deleted entry on the next
 * /cart visit and re-selects it. Ids are unique and deletes are permanent,
 * so the set never needs clearing.
 */
const deletedIds = new Set<string>();

/** Drops ids deleted in this tab from a snapshot, and any pick naming them. */
export function scrubDeletedCheckoutEntities(data: CartBootstrapData): CartBootstrapData {
  if (deletedIds.size === 0) return data;
  const keep = <T extends { id: string }>(list: T[]) => list.filter((item) => !deletedIds.has(item.id));
  const { delivery, payment } = data;
  const addresses = keep(delivery.addresses);
  const selection = { ...delivery.selection };
  if (selection.addressId && deletedIds.has(selection.addressId)) {
    selection.addressId = addresses.find((a) => a.isDefault && a.kind === 'livraison')?.id ?? null;
  }
  if (selection.billingAddressId && deletedIds.has(selection.billingAddressId)) {
    selection.billingAddressId = null;
    selection.sameAsBilling = true;
  }
  if (selection.paymentMethodId && deletedIds.has(selection.paymentMethodId)) {
    selection.paymentMethodId = null;
  }
  const defaultPaymentMethod =
    payment.defaultPaymentMethod?.type === 'card' && deletedIds.has(payment.defaultPaymentMethod.id)
      ? null
      : payment.defaultPaymentMethod;
  const initialPaymentMethodId =
    payment.initialPaymentMethodId && deletedIds.has(payment.initialPaymentMethodId)
      ? null
      : payment.initialPaymentMethodId;
  return {
    ...data,
    delivery: { ...delivery, addresses, selection },
    payment: {
      ...payment,
      paymentMethods: keep(payment.paymentMethods),
      sessionMethods: keep(payment.sessionMethods),
      defaultPaymentMethod,
      initialPaymentMethodId,
    },
  };
}

/** Call after deleting an address or payment method anywhere in the shop. */
export function markCheckoutEntityDeleted(id: string): void {
  deletedIds.add(id);
  if (entry) entry = { ...entry, data: scrubDeletedCheckoutEntities(entry.data) };
}

export function touchCartSpaActivity(): void {
  lastSpaActivityAt = Date.now();
}

function isCartSpaSessionWarm(): boolean {
  if (lastSpaActivityAt <= 0) return false;
  return Date.now() - lastSpaActivityAt <= shopConfig.cartPageCacheTtlMs;
}

/**
 * Returns a cached snapshot only when the SPA session is still warm and the
 * generation + audience match. Expired idle sessions discard the entry so
 * the next /cart visit runs the blocking LoadingModal path.
 */
export function readCartBootstrapCache(
  generation: string,
  audience: CacheAudience,
): CartBootstrapData | null {
  if (!isCartSpaSessionWarm()) {
    entry = null;
    return null;
  }
  if (!entry || entry.generation !== generation || entry.audience !== audience) {
    return null;
  }
  return entry.data;
}

export function writeCartBootstrapCache(
  generation: string,
  audience: CacheAudience,
  data: CartBootstrapData,
): void {
  entry = { generation, audience, data, fetchedAt: Date.now() };
  touchCartSpaActivity();
}

/** Drop the snapshot (login / logout / order / empty cart). */
export function invalidateCartBootstrapCache(
  _reason: 'login' | 'logout' | 'order' | 'empty' | 'manual' = 'manual',
): void {
  entry = null;
}
