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
  skip: 'Vai al contenuto principale',
  skipFooter: 'Vai a piè di pagina',
  backLink: 'Indietro',
  brandAria: 'Lumen, torna alla home',
  navAria: 'Navigazione principale',
  menuOpenAria: 'Apri il menu',
  menuCloseAria: 'Chiudi il menu',
  newWindowAria: 'nuova finestra',
  continueAction: 'Continua',
  requiredFieldsNote: 'I campi contrassegnati da un asterisco (*) sono obbligatori.',
};
