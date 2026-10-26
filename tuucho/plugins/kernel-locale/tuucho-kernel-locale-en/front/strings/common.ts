import type { Strings } from '@kernel/front/assets/i18n/types';

/** Top-level labels belonging to no single screen. */
export const common: {
  [
    K in
      | 'skip'
      | 'skipFooter'
      | 'backLink'
      | 'brandAria'
      | 'navAria'
      | 'menuOpenAria'
      | 'menuCloseAria'
      | 'newWindowAria'
      | 'continueAction'
      | 'requiredFieldsNote'
      | 'languageSwitcherLabel'
  ]: Strings[K];
} = {
  skip: 'Skip to main content',
  skipFooter: 'Skip to footer',
  backLink: 'Back',
  brandAria: 'Shop, back to home',
  navAria: 'Main navigation',
  menuOpenAria: 'Open menu',
  menuCloseAria: 'Close menu',
  newWindowAria: 'new window',
  continueAction: 'Continue',
  requiredFieldsNote: 'Fields marked with an asterisk (*) are required.',
  languageSwitcherLabel: 'Change language',
};
