import { useState } from 'react';
import { loadGuestCheckoutDraft } from '../../state/guestCheckoutDraft';

/** Guest email/consent draft mirrored from GuestCheckoutPrompt for pay gating. */
export function useCartGuestDraft() {
  const [guestEmail, setGuestEmail] = useState(() => loadGuestCheckoutDraft().email);
  const [guestConsent, setGuestConsent] = useState(() => loadGuestCheckoutDraft().consent);
  return { guestEmail, setGuestEmail, guestConsent, setGuestConsent };
}
