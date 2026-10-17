import type { Address } from '../api/account';
import type { PaymentMethod } from '../api/checkout';
import { isArrayOfObjectsWithId } from '../utils/typeGuards';

const STORAGE_KEY = 'psn-checkout-ephemeral-vault-v1';

interface StoredVault {
  v: 1;
  iv: string;
  ciphertext: string;
}

export interface CheckoutEphemeralPlain {
  addresses: Address[];
  paymentMethods: PaymentMethod[];
}

const EMPTY: CheckoutEphemeralPlain = { addresses: [], paymentMethods: [] };

/**
 * Encrypted one-time checkout cache (addresses + cards the saved-list APIs
 * omit). Ciphertext lives in sessionStorage; the AES key never does.
 *
 * The tab's checkout privacy session supplies the key in both guest and
 * authenticated modes. It stays in RAM; F5 resumes the server session and
 * imports the same key so this tab can decrypt its existing blob.
 *
 * Sync getters/setters operate on an in-memory plaintext cache; persistence
 * is queued asynchronously like guestCardVault.
 */
let cryptoKey: CryptoKey | null = null;
let plain: CheckoutEphemeralPlain = { ...EMPTY, addresses: [], paymentMethods: [] };
let unlocked = false;
let pendingWrite: Promise<void> = Promise.resolve();

function queueWrite(write: () => Promise<void>): void {
  pendingWrite = pendingWrite.then(write, write).then(
    () => undefined,
    () => undefined,
  );
}

function hasCrypto(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle;
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

async function importRawKey(raw: BufferSource): Promise<CryptoKey> {
  return window.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function persist(): Promise<void> {
  if (!hasCrypto() || !cryptoKey || typeof window === 'undefined') return;
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(plain));
  const cipherBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cryptoKey,
    encoded as BufferSource,
  );
  const stored: StoredVault = {
    v: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

async function tryDecryptIntoMemory(key: CryptoKey): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Keep any in-memory writes that raced ahead of unlock.
    return true;
  }
  try {
    const stored = JSON.parse(raw) as Partial<StoredVault>;
    if (stored.v !== 1 || typeof stored.iv !== 'string' || typeof stored.ciphertext !== 'string') {
      window.sessionStorage.removeItem(STORAGE_KEY);
      plain = { addresses: [], paymentMethods: [] };
      return true;
    }
    const plainBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(stored.iv) as BufferSource },
      key,
      base64ToBytes(stored.ciphertext) as BufferSource,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plainBuf)) as Partial<CheckoutEphemeralPlain>;
    // Only a lightweight "still an object with an id" check, same as
    // guestCardVault — the full Address/PaymentMethod shape is the API's to
    // own, and anything carried over here is re-submitted to it, never
    // trusted as-is. This just stops outright garbage reaching React state.
    plain = {
      addresses: isArrayOfObjectsWithId(parsed.addresses) ? (parsed.addresses as Address[]) : [],
      paymentMethods: isArrayOfObjectsWithId(parsed.paymentMethods)
        ? (parsed.paymentMethods as PaymentMethod[])
        : [],
    };
    return true;
  } catch {
    // Wrong key (guest→auth transition) or tampered blob: start empty.
    window.sessionStorage.removeItem(STORAGE_KEY);
    plain = { addresses: [], paymentMethods: [] };
    return false;
  }
}

function schedulePersist(): void {
  queueWrite(persist);
}

/** Guest mode: generate a tab-local key and attempt to decrypt any prior
 * guest ciphertext in this tab (only works if the JS context never died). */
async function unlockCheckoutVaultAsGuest(): Promise<void> {
  if (!hasCrypto()) {
    cryptoKey = null;
    unlocked = true;
    plain = { addresses: [], paymentMethods: [] };
    return;
  }
  if (unlocked && cryptoKey) return;
  cryptoKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await tryDecryptIntoMemory(cryptoKey);
  unlocked = true;
}

/** Authenticated mode: import the server-issued raw key and decrypt this
 * tab's sessionStorage blob when present. */
export async function unlockCheckoutVaultWithServerKey(vaultKeyBase64: string): Promise<void> {
  if (!hasCrypto()) {
    cryptoKey = null;
    unlocked = true;
    plain = { addresses: [], paymentMethods: [] };
    return;
  }
  cryptoKey = await importRawKey(base64ToBytes(vaultKeyBase64) as BufferSource);
  await tryDecryptIntoMemory(cryptoKey);
  unlocked = true;
}

/** Drop RAM key + plaintext and remove the sessionStorage blob. */
export function lockCheckoutVault(): void {
  cryptoKey = null;
  unlocked = false;
  plain = { addresses: [], paymentMethods: [] };
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

export async function flushCheckoutVault(): Promise<void> {
  await pendingWrite;
}

export function isCheckoutVaultUnlocked(): boolean {
  return unlocked;
}

export function getCheckoutEphemeralPlain(): CheckoutEphemeralPlain {
  return {
    addresses: [...plain.addresses],
    paymentMethods: [...plain.paymentMethods],
  };
}

export function setCheckoutEphemeralAddresses(addresses: Address[]): void {
  plain = { ...plain, addresses: [...addresses] };
  if (!unlocked) void unlockCheckoutVaultAsGuest().then(() => schedulePersist());
  else schedulePersist();
}

export function setCheckoutEphemeralPaymentMethods(methods: PaymentMethod[]): void {
  plain = { ...plain, paymentMethods: [...methods] };
  if (!unlocked) void unlockCheckoutVaultAsGuest().then(() => schedulePersist());
  else schedulePersist();
}

export function clearCheckoutEphemeralPlain(): void {
  plain = { addresses: [], paymentMethods: [] };
  if (unlocked) schedulePersist();
}
