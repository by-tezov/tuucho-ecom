import type { Address, AddressInput } from '../api/account';
import type { Size } from '../api/cart';
import { shopConfig } from '../config/env';
import { extraSetsFromUnknown } from '../utils/cartExtra';
import { isBoolean, isFiniteNumber, isPlainObject, isRecordOf, isString } from '../utils/typeGuards';

const STORAGE_KEY = 'psn-guest-cart-v3';

interface StoredGuestState {
  expiresAt: number;
  state: Partial<GuestState>;
}

export interface GuestCartLine {
  productId: string;
  shapeKey: string; // '' for accessory
  lengthKey: string; // '' for accessory
  size: Size | ''; // '' for accessory
  /** byQuantity pack; missing on older v3 payloads is treated as `''`. */
  packKey?: string;
  quantity: number;
  /** Card note (see utils/cartComment); absent when none. */
  comment?: string;
}

export interface GuestState {
  cart: GuestCartLine[];
  /** Opaque plugin extra-set rows. Kernel never inspects the shape. */
  extra: unknown[];
  /** productId -> "<shapeKey>::<lengthKey>" — the variant whose photos the
   * card shows. Stored as one composite string so the map stays flat. */
  favorites: Record<string, string>;
  courierCode: string | null;
  express: boolean;
  voucherCode: string | null;
  /** paypal | bancontact | google_pay | apple_pay only — not pm_… card ids. */
  paymentMethodId: string | null;
}

// Card data and addresses deliberately do NOT live here: both are stored in
// the encrypted, in-memory-key guest checkout vault (guestCardVault.ts).

/** AddressInput's optional fields default server-side (see its own doc
 * comment) — mirrored here so a guest address behaves identically before
 * any account exists to apply those defaults for it. */
export function normalizeGuestAddress(input: AddressInput, id: string): Address {
  return {
    id,
    kind: input.kind,
    label: input.label ?? null,
    recipientName: input.recipientName ?? null,
    companyName: input.companyName ?? null,
    line1: input.line1,
    line2: input.line2 ?? null,
    deliveryNotes: input.kind === 'facturation' ? null : (input.deliveryNotes ?? null),
    postalCode: input.postalCode,
    city: input.city,
    countryCode: input.countryCode,
    phone: input.phone ?? null,
    networkCodes: input.kind === 'facturation' ? [] : (input.networkCodes ?? ['home']),
    pickupPoints: input.kind === 'facturation' ? {} : (input.pickupPoints ?? {}),
    isDefault: input.isDefault ?? false,
    savedForFuture: input.savedForFuture !== false,
  };
}

const EMPTY_STATE: GuestState = {
  cart: [],
  extra: [],
  favorites: {},
  courierCode: null,
  express: false,
  voucherCode: null,
  paymentMethodId: null,
};

function isGuestCartLine(value: unknown): value is GuestCartLine {
  return (
    isPlainObject(value) &&
    isString(value.productId) &&
    isString(value.shapeKey) &&
    isString(value.lengthKey) &&
    (value.size === '' || isString(value.size)) &&
    (value.packKey === undefined || isString(value.packKey)) &&
    (value.comment === undefined || isString(value.comment)) &&
    isFiniteNumber(value.quantity)
  );
}

/** Rebuilds a GuestState field by field from an untrusted, already-parsed
 * object, falling back to EMPTY_STATE's default per field on any type
 * mismatch — the same "current interface or discard" policy as a corrupt
 * JSON blob, just extended past the top level. This is what keeps an older
 * or newer stored shape from ever reaching the rest of the app instead of
 * failing wherever it first gets used the wrong way. */
function sanitizeGuestState(value: unknown): GuestState {
  const raw = isPlainObject(value) ? value : {};
  return {
    cart: Array.isArray(raw.cart)
      ? raw.cart.filter(isGuestCartLine).map((line) => ({ ...line, packKey: line.packKey ?? '' }))
      : [],
    extra: extraSetsFromUnknown(raw.extra),
    favorites: isRecordOf(raw.favorites, isString) ? raw.favorites : {},
    courierCode: raw.courierCode === null || isString(raw.courierCode) ? raw.courierCode : null,
    express: isBoolean(raw.express) ? raw.express : false,
    voucherCode: raw.voucherCode === null || isString(raw.voucherCode) ? raw.voucherCode : null,
    paymentMethodId:
      raw.paymentMethodId === null || isString(raw.paymentMethodId) ? raw.paymentMethodId : null,
  };
}

/** Non-sensitive signed-out state (favorite, cart, courier and voucher)
 * lives here instead of
 * prompting for login — see state/guestSync.ts for how it merges into the
 * account once they actually sign in. Card/payment-method data lives
 * separately, encrypted — see state/guestCardVault.ts. */
export function loadGuestState(): GuestState {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      clearGuestState();
      return EMPTY_STATE;
    }
    const stored = parsed as Partial<StoredGuestState>;
    if (
      typeof stored.expiresAt !== 'number' ||
      !Number.isFinite(stored.expiresAt) ||
      stored.expiresAt <= Date.now() ||
      !stored.state ||
      typeof stored.state !== 'object' ||
      Array.isArray(stored.state)
    ) {
      clearGuestState();
      return EMPTY_STATE;
    }
    // Legacy fields (addresses, selectedAddressId, sameAsBilling,
    // selectedBillingAddressId) moved to guestCardVault.ts long ago; a state
    // object built field-by-field from the current GuestState shape already
    // omits anything not listed there, so no separate stripping step is
    // needed any more.
    const safeState = sanitizeGuestState(stored.state);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ expiresAt: stored.expiresAt, state: safeState } satisfies StoredGuestState),
    );
    return safeState;
  } catch {
    clearGuestState();
    return EMPTY_STATE;
  }
}

export function saveGuestState(patch: Partial<GuestState>): GuestState {
  const next = { ...loadGuestState(), ...patch };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        expiresAt: Date.now() + shopConfig.guestStorageRetentionMs,
        state: next,
      } satisfies StoredGuestState),
    );
  }
  return next;
}

export function clearGuestState(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Called right after a guest order is confirmed — the cart/courier/voucher
 * choices that led to it are now stale (the order itself, not the cart, is
 * what matters from here), so a guest revisiting /cart shouldn't still see
 * what they just bought sitting there as if nothing happened. Unlike
 * clearGuestState (used on login/merge, where the account takes over
 * everything), this deliberately keeps favorites — a completed purchase has
 * no bearing on designs the guest liked. */
export function clearGuestCart(): void {
  saveGuestState({
    cart: [],
    extra: [],
    courierCode: null,
    express: false,
    voucherCode: null,
    paymentMethodId: null,
  });
}

export function hasGuestData(state: GuestState): boolean {
  return (
    state.cart.length > 0 ||
    state.extra.length > 0 ||
    Object.keys(state.favorites).length > 0 ||
    !!state.voucherCode
  );
}

