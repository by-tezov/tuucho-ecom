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
  skip: 'Aller au contenu principal',
  skipFooter: 'Aller au pied de page',
  backLink: 'Retour',
  brandAria: 'Lumen, retour à l’accueil',
  navAria: 'Navigation principale',
  menuOpenAria: 'Ouvrir le menu',
  menuCloseAria: 'Fermer le menu',
  newWindowAria: 'nouvelle fenêtre',
  continueAction: 'Continuer',
  requiredFieldsNote: 'Les champs marqués d’un astérisque (*) sont obligatoires.',
};
