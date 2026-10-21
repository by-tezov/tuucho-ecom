import type { Strings } from '../../types';

export const notifications: Strings['notifications'] = {
  pageTitle: 'Notifications',
  emailsSectionTitle: 'Emails',
  emailsMasterLabel: 'Receive emails',
  emailsMasterDescription:
    'The big switch. Off = radio silence (except password reset and critical security). On = you pick channel by channel.',
  primaryEmailLabel: 'Primary address',
  verifiedBadge: 'Verified',
  unverifiedBadge: 'Unverified',
  unverifiedBanner:
    'Confirm your email to receive the fun alerts (new drops, cart, favorites…). You can already set your preferences below.',
  loading: 'Loading…',
  loadError: 'Couldn’t load your preferences. Try again in a moment.',
  masterDisableConfirmTitle: 'Turn off all emails?',
  masterDisableConfirmMessage:
    'No more order recaps, invoices, or alerts. You can still sign in and reset your password.',
  transactionalSectionTitle: 'Orders & security',
  marketingSectionTitle: 'Inspiration & cart',
  disableConfirmButton: 'Disable',
  cancelButton: 'Cancel',
  orderConfirmation: {
    title: 'Order confirmation',
    description: 'The “you’re good, it’s confirmed” right after payment. A little high-five in your inbox.',
    disableConfirmTitle: 'Turn off order confirmations?',
    disableConfirmMessage: 'You won’t get the email recap after a purchase. It’s still in your account.',
  },
  orderShipped: {
    title: 'Order shipped',
    description: 'The “it’s on the way” ping when your sets leave the studio.',
    disableConfirmTitle: 'Turn off shipping emails?',
    disableConfirmMessage: 'No email when an order ships. Tracking stays in your account.',
  },
  invoice: {
    title: 'Invoice',
    description: 'PDF invoice in your inbox, handy for expenses and refunds.',
    disableConfirmTitle: 'Turn off invoice emails?',
    disableConfirmMessage: 'You can still download invoices from your orders.',
  },
  security: {
    title: 'Security alerts',
    description: 'Optional security digests. Critical stuff (lock, password reset) always sends.',
    disableConfirmTitle: 'Turn off optional security alerts?',
    disableConfirmMessage: 'Password reset, account lock, and deletion emails still always send.',
  },
  chatReply: {
    title: 'Chat replies',
    description: 'Receive an email when Shop replies while you are not viewing the conversation.',
    disableConfirmTitle: 'Turn off chat notifications?',
    disableConfirmMessage: 'You can still read replies in your conversation space.',
  },
  loyaltyExpiry: {
    title: 'Loyalty expiry reminder',
    description: 'A heads-up before your loyalty credit expires.',
    disableConfirmTitle: 'Turn off loyalty expiry reminders?',
    disableConfirmMessage: 'You may lose credit without a reminder before the expiry date.',
  },
  nouveautes: {
    title: 'New arrivals',
    description: 'Fresh gallery drops. So you don’t miss the set that slaps.',
    disableConfirmTitle: 'Turn off new arrivals?',
    disableConfirmMessage: 'You won’t get pinged when new sets land.',
  },
  cartReminder: {
    title: 'Cart waiting',
    description: 'A chill nudge if you left pieces in the cart. No aggressive spam.',
    disableConfirmTitle: 'Turn off cart reminders?',
    disableConfirmMessage: 'We won’t remind you about an unfinished cart.',
  },
  favoriteSold: {
    title: 'Favorite sold',
    description: 'Your crush just left the chat. So you know it wasn’t a stock glitch.',
    disableConfirmTitle: 'Turn off favorite-sold alerts?',
    disableConfirmMessage: 'You won’t hear when a favorite sells out.',
  },
  favoriteRestock: {
    title: 'Favorite restocked',
    description: 'Plot twist: it’s back. We tell you before it ghosts again.',
    disableConfirmTitle: 'Turn off restock alerts?',
    disableConfirmMessage: 'No alert when a favorite is available again.',
  },
  promo: {
    title: 'Offers & codes',
    description: 'The real deals (codes, drops). Rare, not a Monday newsletter.',
    disableConfirmTitle: 'Turn off offers?',
    disableConfirmMessage: 'You won’t get promo codes by email.',
  },
};
