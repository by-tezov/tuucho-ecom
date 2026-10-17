import { clearEphemeralAddresses } from './ephemeralAddresses';
import { clearEphemeralCards } from './ephemeralCards';
import { clearCompletedGuestCheckoutVault } from './guestCardVault';
import { clearGuestCart } from './guestCart';
import { clearGuestCheckoutDraft } from './guestCheckoutDraft';

/** Successful guest checkout is a hard lifecycle boundary. Keep favourites,
 * but clear every cart, delivery, identification, and payment draft before a
 * later purchase can bootstrap from browser storage. */
export function clearGuestCheckoutAfterOrder(): Promise<void> {
  clearGuestCart();
  clearGuestCheckoutDraft();
  clearEphemeralAddresses();
  clearEphemeralCards();
  return clearCompletedGuestCheckoutVault();
}
