import type { Strings } from '../../types';

export const checkoutSessionExpired: Strings['checkoutSessionExpired'] = {
  title: 'Checkout session expired',
  message: (minutes) =>
    `For your security, the address and payment details that were not saved have been cleared after ${minutes} minutes without activity.`,
  continue: 'Continue',

  warningTitle: 'Your checkout session is about to expire',

  warningMessage:
    'Without any activity from you in the next {n} minutes, the details entered for your order will be cleared for security.',
};
