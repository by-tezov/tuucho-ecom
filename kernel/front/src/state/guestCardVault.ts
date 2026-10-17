import type { Address } from '../api/account';
import type { DefaultPaymentMethod, PaymentMethod } from '../api/checkout';
import { isArrayOfObjectsWithId, isBoolean, isPlainObject, isString } from '../utils/typeGuards';

const VAULT_KEY = 'psn-guest-card-vault-v1';

interface StoredVault {
  v: 1;
  iv: string;
  ciphertext: string;
}

export interface GuestCards {
  paymentMethods: PaymentMethod[];
  defaultPaymentMethod: DefaultPaymentMethod | null;
}

export interface GuestAddressState {
  addresses: Address[];
  selectedAddressId: string | null;
  sameAsBilling: boolean;
  selectedBillingAddressId: string | null;
}

interface GuestVault extends GuestCards {
  addressState: GuestAddressState;
}

const EMPTY_ADDRESS_STATE: GuestAddressState = {
  addresses: [],
  selectedAddressId: null,
  sameAsBilling: true,
  selectedBillingAddressId: null,
};
const EMPTY: GuestVault = {
  paymentMethods: [],
  defaultPaymentMethod: null,
  addressState: EMPTY_ADDRESS_STATE,
};

/** `paymentMethods`/`addresses` aren't re-validated field by field here — the
 * API is the source of truth for their full shape, and a card/address
 * carried over from the guest vault always gets re-submitted to it on
 * register/login (see guestSync.ts), never trusted as-is server-side. This
 * only rejects outright garbage (no longer even an object, or missing its
 * id) so a shape change elsewhere can't crash whatever first reads `.id`. */
function isDefaultPaymentMethod(value: unknown): value is DefaultPaymentMethod {
  if (!isPlainObject(value)) return false;
  if (
    value.type === 'paypal' ||
    value.type === 'bancontact' ||
    value.type === 'google_pay' ||
    value.type === 'apple_pay'
  )
    return true;
  return value.type === 'card' && isString(value.id);
}

/** Rebuilds the decrypted vault payload field by field, discarding anything
 * that doesn't match the current shape instead of spreading it straight into
 * defaults — see typeGuards.ts's doc comment for why a plain merge isn't
 * enough here. A lost/incompatible field degrades to "no card"/"no address"
 * rather than surfacing malformed data downstream. */
function sanitizeGuestVault(value: unknown): GuestVault {
  const raw = isPlainObject(value) ? value : {};
  const addressRaw = isPlainObject(raw.addressState) ? raw.addressState : {};
  return {
    paymentMethods: isArrayOfObjectsWithId(raw.paymentMethods) ? (raw.paymentMethods as PaymentMethod[]) : [],
    defaultPaymentMethod: isDefaultPaymentMethod(raw.defaultPaymentMethod) ? raw.defaultPaymentMethod : null,
    addressState: {
      addresses: isArrayOfObjectsWithId(addressRaw.addresses) ? (addressRaw.addresses as Address[]) : [],
      selectedAddressId: isString(addressRaw.selectedAddressId) ? addressRaw.selectedAddressId : null,
      sameAsBilling: isBoolean(addressRaw.sameAsBilling) ? addressRaw.sameAsBilling : true,
      selectedBillingAddressId: isString(addressRaw.selectedBillingAddressId)
        ? addressRaw.selectedBillingAddressId
        : null,
    },
  };
}

/** A card a signed-out visitor tokenizes (see GuestAddCardModal.tsx) is
 * genuinely sensitive — its pm_… id is a bearer token: whoever holds it can
 * attach it to their own account via POST /account/payment-methods/attach,
 * no further proof of ownership required. Caching it in plain localStorage
 * like the rest of state/guestCart.ts would mean it silently outlives the
 * guest's visit and gets inherited by the next person who logs in on a
 * shared/public computer.
 *
 * Instead, the id (and everything else here) is encrypted with the current
 * tab's server-issued checkout-session key. Ciphertext and opaque session
 * token live in sessionStorage; the raw AES key remains RAM-only and is
 * fetched again after refresh while the server-side idle session is valid.
 *
 * Deliberately per-tab, not per-browser: each tab gets its own key (module
 * state isn't shared across tabs), so a card added in one tab won't appear
 * in another — a smaller blast radius than trying to synchronize a secret
 * key across tabs via any persisted channel would allow. */
let keyPromise: Promise<CryptoKey> | null = null;
// Address/card changes are encrypted asynchronously. Serialize them so two
// quick checkout interactions cannot overwrite one another, and so the
// login/register reconciliation can wait for the last accepted change.
let pendingVaultWrite: Promise<void> = Promise.resolve();

function queueVaultWrite<T>(write: () => Promise<T>): Promise<T> {
  const result = pendingVaultWrite.then(write, write);
  // Keep the queue usable after a failed encryption/storage attempt; callers
  // still receive that failure through `result` when they choose to await it.
  pendingVaultWrite = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function hasCrypto(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle;
}

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    // extractable: false — even a reference to this CryptoKey object can't
    // be used to read the raw key bytes back out, only to encrypt/decrypt.
    keyPromise = window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
  }
  return keyPromise;
}

export async function unlockGuestCheckoutVaultWithServerKey(vaultKeyBase64: string): Promise<void> {
  if (!hasCrypto()) return;
  keyPromise = window.crypto.subtle.importKey(
    'raw',
    base64ToBytes(vaultKeyBase64) as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await keyPromise;
}

export function lockGuestCheckoutVault(): void {
  keyPromise = null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadGuestVault(): Promise<GuestVault> {
  if (!hasCrypto()) return EMPTY;
  const raw = window.sessionStorage.getItem(VAULT_KEY);
  if (!raw) return EMPTY;
  try {
    const { v, iv, ciphertext } = JSON.parse(raw) as Partial<StoredVault>;
    if (v !== 1 || typeof iv !== 'string' || typeof ciphertext !== 'string') {
      clearGuestCards();
      return EMPTY;
    }
    const key = await getKey();
    const plainBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(iv) as BufferSource },
      key,
      base64ToBytes(ciphertext) as BufferSource,
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plainBuf));
    return sanitizeGuestVault(parsed);
  } catch {
    // Wrong/missing key (this session never generated one that matches —
    // see the module doc comment) or corrupt data either way: there is no
    // path to recover it, and that's the intended behavior, not a bug.
    clearGuestCards();
    return EMPTY;
  }
}

async function saveGuestVault(patch: Partial<GuestVault>): Promise<GuestVault> {
  const current = await loadGuestVault();
  const next = { ...current, ...patch };
  if (hasCrypto()) {
    const key = await getKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plainBytes = new TextEncoder().encode(JSON.stringify(next));
    const cipherBuf = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plainBytes as BufferSource,
    );
    window.sessionStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        v: 1,
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
      } satisfies StoredVault),
    );
  }
  return next;
}

export async function loadGuestCards(): Promise<GuestCards> {
  const { paymentMethods, defaultPaymentMethod } = await loadGuestVault();
  return { paymentMethods, defaultPaymentMethod };
}

export function saveGuestCards(patch: Partial<GuestCards>): Promise<GuestCards> {
  return queueVaultWrite(async () => {
    const { paymentMethods, defaultPaymentMethod } = await saveGuestVault(patch);
    return { paymentMethods, defaultPaymentMethod };
  });
}

export async function loadGuestAddressState(): Promise<GuestAddressState> {
  return (await loadGuestVault()).addressState;
}

export function saveGuestAddressState(patch: Partial<GuestAddressState>): Promise<GuestAddressState> {
  return queueVaultWrite(async () => {
    const current = await loadGuestVault();
    const saved = await saveGuestVault({ addressState: { ...current.addressState, ...patch } });
    return saved.addressState;
  });
}

/** Drop remembered guest address/card entries after manage-order attached
 * them server-side, so same-browser login merge does not create duplicates.
 * One-time checkout entries stay in the vault. */
export function clearRememberedGuestCheckout(): Promise<void> {
  return queueVaultWrite(async () => {
    const current = await loadGuestVault();
    const paymentMethods = current.paymentMethods.filter((method) => method.savedForFuture === false);
    const currentDefault = current.defaultPaymentMethod;
    const defaultPaymentMethod =
      currentDefault?.type === 'card' && !paymentMethods.some((method) => method.id === currentDefault.id)
        ? null
        : currentDefault;
    await saveGuestVault({
      paymentMethods,
      defaultPaymentMethod,
      addressState: {
        ...current.addressState,
        addresses: current.addressState.addresses.filter((address) => address.savedForFuture === false),
      },
    });
  }).then(() => undefined);
}

/** A confirmed guest order ends the whole checkout, so neither remembered
 * nor one-time address/card data belongs to the next cart. Remove the vault
 * immediately for the mounted UI, then queue a second removal after every
 * already-accepted encryption write so an in-flight save cannot resurrect
 * the completed checkout. */
export function clearCompletedGuestCheckoutVault(): Promise<void> {
  clearGuestCards();
  return queueVaultWrite(async () => clearGuestCards()).then(() => undefined);
}

/** Wait until every accepted encrypted checkout-state update is durable.
 * AuthContext calls this immediately before guest-to-account reconciliation,
 * so a customer can register straight after adding an address or card. */
export async function flushGuestCheckoutVault(): Promise<void> {
  await pendingVaultWrite;
}

export function clearGuestCards(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(VAULT_KEY);
  // One-way cleanup of the pre-session implementation's unreadable legacy
  // ciphertext. No key capable of decrypting it survived a reload.
  window.localStorage.removeItem(VAULT_KEY);
}
