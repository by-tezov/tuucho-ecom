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
  skip: 'Naar de hoofdinhoud',
  skipFooter: 'Naar de voettekst',
  backLink: 'Terug',
  brandAria: 'Lumen, terug naar home',
  navAria: 'Hoofdnavigatie',
  menuOpenAria: 'Menu openen',
  menuCloseAria: 'Menu sluiten',
  newWindowAria: 'nieuw venster',
  continueAction: 'Doorgaan',
  requiredFieldsNote: 'Velden met een sterretje (*) zijn verplicht.',
};
