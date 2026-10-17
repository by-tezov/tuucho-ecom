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
  ]: Strings[K];
} = {
  skip: 'Aller au contenu principal',
  skipFooter: 'Aller au pied de page',
  backLink: 'Retour',
  brandAria: 'Shop, retour à l’accueil',
  navAria: 'Navigation principale',
  menuOpenAria: 'Ouvrir le menu',
  menuCloseAria: 'Fermer le menu',
  newWindowAria: 'nouvelle fenêtre',
  continueAction: 'Continuer',
  requiredFieldsNote: 'Les champs marqués d’un astérisque (*) sont obligatoires.',
};
