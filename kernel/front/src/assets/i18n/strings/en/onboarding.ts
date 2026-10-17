import type { Strings } from '../../types';

export const onboarding: Strings['onboarding'] = {
  closeAria: 'Close introduction',
  prevAria: 'Previous slide',
  nextLabel: 'Next',
  doneLabel: 'Got it',
  stepAria: (current, total) => `Step ${current} of ${total}`,
  handmade: {
    title: 'Shop',
    headline: 'Handmade quality',
    body: 'Every set is filed, painted and decorated by hand, one by one. No mass production, a carefully made piece, prepared for you.',
  },
  deals: {
    title: 'Perks',
    headline: 'Discounts and free shipping',
    subheadline:
      'Buying several sets unlocks volume savings, and free shipping turns on automatically once you reach the set amount.',
    volumeTitle: 'Volume discounts',
    volumeLead: 'The more sets you order, the more you save.',
    volumeTier: (qty, percent) => `${qty} sets −${percent}%`,
    volumeJoin: ' · ',
    volumeHint: 'The cart bar rises with every set you add.',
    freeShippingTitle: 'Shipping',
    freeShippingLead: (amount) => `Free shipping from ${amount} of merchandise.`,
    freeShippingHint: 'The threshold depends on the delivery country.',
    genericBody:
      'Volume discounts on sets and free shipping from a certain amount await you in the cart.',
  },
  loyalty: {
    title: 'Wallet',
    headline: 'Earn credit on your orders',
    body: 'With an account, you earn loyalty credit on your orders and can spend it on a later cart.',
  },
  custom: {
    title: 'Made to measure',
    headline: 'Custom size or design',
    body: 'Need a size or design that isn’t in the shop? Write from the Contact page, we’ll see together what’s possible.',
  },
};
