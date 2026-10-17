import type { PaymentMethod } from '../api/checkout';
import { getCheckoutEphemeralPlain, setCheckoutEphemeralPaymentMethods } from './checkoutEphemeralVault';

/** One-time cards for the current checkout tab — never offered as saved
 * methods. Persisted as AES-GCM ciphertext in sessionStorage; the key stays
 * in RAM (guest) or is re-fetched from the API (authenticated). */
export function loadEphemeralCards(): PaymentMethod[] {
  return getCheckoutEphemeralPlain().paymentMethods;
}

function saveEphemeralCards(methods: PaymentMethod[]): void {
  setCheckoutEphemeralPaymentMethods(methods);
}

export function addEphemeralCard(method: PaymentMethod): PaymentMethod[] {
  const next = [...loadEphemeralCards().filter((m) => m.id !== method.id), method];
  saveEphemeralCards(next);
  return next;
}

export function removeEphemeralCard(id: string): PaymentMethod[] {
  const next = loadEphemeralCards().filter((m) => m.id !== id);
  saveEphemeralCards(next);
  return next;
}

export function clearEphemeralCards(): void {
  setCheckoutEphemeralPaymentMethods([]);
}
