import type { Strings } from '../../types';

export const checkoutSessionExpired: Strings['checkoutSessionExpired'] = {
  title: 'Session de paiement expirée',
  message: (minutes) =>
    `Pour votre sécurité, les adresses et moyens de paiement non enregistrés ont été effacés après ${minutes} minutes sans activité.`,
  continue: 'Continuer',
  warningTitle: 'Votre session de paiement va expirer',
  warningMessage:
    'Sans activité de votre part dans les {n} prochaines minutes, les informations saisies pour votre commande seront effacées par sécurité.',
};
