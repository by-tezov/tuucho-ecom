import type { Address } from '../api/account';
import { getCheckoutEphemeralPlain, setCheckoutEphemeralAddresses } from './checkoutEphemeralVault';

/** One-time addresses for the current checkout tab — never offered in the
 * saved address book. Persisted as AES-GCM ciphertext in sessionStorage; the
 * key stays in RAM (guest) or is re-fetched from the API (authenticated). */
export function loadEphemeralAddresses(): Address[] {
  return getCheckoutEphemeralPlain().addresses;
}

function saveEphemeralAddresses(addresses: Address[]): void {
  setCheckoutEphemeralAddresses(addresses);
}

export function addEphemeralAddress(address: Address): Address[] {
  const next = [...loadEphemeralAddresses().filter((a) => a.id !== address.id), address];
  saveEphemeralAddresses(next);
  return next;
}

export function removeEphemeralAddress(id: string): Address[] {
  const next = loadEphemeralAddresses().filter((a) => a.id !== id);
  saveEphemeralAddresses(next);
  return next;
}

export function clearEphemeralAddresses(): void {
  setCheckoutEphemeralAddresses([]);
}

/** Saved list + session one-time addresses, deduped by id (saved wins). */
export function mergeAddressLists(
  saved: Address[],
  ephemeral: Address[] = loadEphemeralAddresses(),
): Address[] {
  const byId = new Map<string, Address>();
  for (const address of ephemeral) byId.set(address.id, address);
  for (const address of saved) byId.set(address.id, address);
  return [...byId.values()];
}
