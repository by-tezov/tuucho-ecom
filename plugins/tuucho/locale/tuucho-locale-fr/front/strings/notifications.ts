import type { Strings } from '@kernel/front/assets/i18n/types';

export const notifications: Strings['notifications'] = {
  pageTitle: 'Notifications',
  emailsSectionTitle: 'Emails',
  emailsMasterLabel: 'Recevoir des emails',
  emailsMasterDescription:
    'Le gros interrupteur. Off = silence radio (sauf reset mdp et sécu critique). On = tu choisis canal par canal.',
  primaryEmailLabel: 'Adresse principale',
  verifiedBadge: 'Vérifiée',
  unverifiedBadge: 'Non vérifiée',
  unverifiedBanner:
    'Confirme ton email pour recevoir les alertes fun (nouveautés, panier, favoris…). Tu peux déjà régler tes préférences en dessous.',
  loading: 'Chargement…',
  loadError: 'Impossible de charger tes préférences. Réessaie dans un instant.',
  masterDisableConfirmTitle: 'Couper tous les emails ?',
  masterDisableConfirmMessage:
    'Plus de récaps commande, factures, ni alertes. Tu pourras toujours te reconnecter et reset ton mdp.',
  transactionalSectionTitle: 'Commandes & sécu',
  marketingSectionTitle: 'Inspiration & panier',
  disableConfirmButton: 'Désactiver',
  cancelButton: 'Annuler',
  orderConfirmation: {
    title: 'Confirmation de commande',
    description:
      'Le “c’est bon, c’est validé” juste après ton paiement. Le petit high-five dans ta boîte mail.',
    disableConfirmTitle: 'Couper les confirmations de commande ?',
    disableConfirmMessage:
      'Tu ne recevras plus le récap email après un achat. Tu le verras toujours dans ton compte.',
  },
  orderShipped: {
    title: 'Commande expédiée',
    description: 'Le “ça part”, pour savoir quand tes sets quittent l’atelier.',
    disableConfirmTitle: 'Couper les mails d’expédition ?',
    disableConfirmMessage:
      'Plus d’email quand une commande est envoyée. Le suivi reste dispo dans ton compte.',
  },
  invoice: {
    title: 'Facture',
    description: 'La facture en PDF dans ta boîte, pratique pour les comptes et les remboursements.',
    disableConfirmTitle: 'Couper les factures par email ?',
    disableConfirmMessage: 'Tu pourras encore télécharger tes factures depuis tes commandes.',
  },
  security: {
    title: 'Alertes sécurité',
    description:
      'Les digests sécu optionnels. Les trucs critiques (lock, reset mdp) restent toujours envoyés.',
    disableConfirmTitle: 'Couper les alertes sécu optionnelles ?',
    disableConfirmMessage: 'Reset mdp, verrouillage compte et suppression restent toujours actifs.',
  },
  chatReply: {
    title: 'Réponses du chat',
    description:
      'Recevoir un e-mail lorsque Shop te répond dans une conversation que tu ne consultes pas.',
    disableConfirmTitle: 'Couper les notifications du chat ?',
    disableConfirmMessage: 'Tu pourras toujours lire les réponses dans ton espace de conversation.',
  },
  loyaltyExpiry: {
    title: 'Rappel expiration cagnotte',
    description: 'Un rappel avant que ton crédit expire.',
    disableConfirmTitle: 'Couper les rappels d’expiration ?',
    disableConfirmMessage: 'Tu pourrais perdre du crédit sans rappel avant la date d’expiration.',
  },
  nouveautes: {
    title: 'Nouveautés',
    description: 'Fresh drops dans la galerie. Pour ne pas rater le set qui te fait de l’œil.',
    disableConfirmTitle: 'Couper les nouveautés ?',
    disableConfirmMessage: 'Tu ne seras plus ping quand de nouveaux sets arrivent.',
  },
  cartReminder: {
    title: 'Panier en attente',
    description: 'Un petit rappel chill si tu as laisse des pieces dans le panier. Pas de spam agressif.',
    disableConfirmTitle: 'Couper les rappels panier ?',
    disableConfirmMessage: 'On ne te rappellera plus ton panier non finalisé.',
  },
  favoriteSold: {
    title: 'Favori vendu',
    description: 'Ton crush vient de partir. Histoire de savoir que ce n’était pas un bug de stock.',
    disableConfirmTitle: 'Couper les alertes favori vendu ?',
    disableConfirmMessage: 'Tu ne seras plus prévenu·e quand un favori est écoulé.',
  },
  favoriteRestock: {
    title: 'Favori de retour',
    description: 'Plot twist : il est revenu. On te le dit vite avant qu’il reparte.',
    disableConfirmTitle: 'Couper les retours en stock ?',
    disableConfirmMessage: 'Plus d’alerte quand un favori redevient dispo.',
  },
  promo: {
    title: 'Offres & codes',
    description: 'Les vrais bons plans (codes, drops). Rare, pas une newsletter tous les lundis.',
    disableConfirmTitle: 'Couper les offres ?',
    disableConfirmMessage: 'Tu ne recevras plus les codes et promos par email.',
  },
};
