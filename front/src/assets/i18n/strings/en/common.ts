import type { Strings } from '../../types';

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
  ]: Strings[K];
} = {
  skip: 'Skip to main content',
  skipFooter: 'Skip to footer',
  backLink: 'Back',
  brandAria: 'Lumen, back to home',
  navAria: 'Main navigation',
  menuOpenAria: 'Open menu',
  menuCloseAria: 'Close menu',
  newWindowAria: 'new window',
  continueAction: 'Continue',
  requiredFieldsNote: 'Fields marked with an asterisk (*) are required.',
};
