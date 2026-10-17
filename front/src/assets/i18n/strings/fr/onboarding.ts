import type { Strings } from '../../types';

export const onboarding: Strings['onboarding'] = {
  closeAria: 'Fermer la présentation',
  prevAria: 'Slide précédente',
  nextLabel: 'Suivant',
  doneLabel: 'C’est compris',
  stepAria: (current, total) => `Étape ${current} sur ${total}`,
  handmade: {
    title: 'Lumen',
    headline: 'Qualité du fait main',
    body: 'Chaque set est limé, peint et décoré à la main, un par un. Pas de production de masse : une pièce soignée, préparée pour toi.',
  },
  deals: {
    title: 'Avantages',
    headline: 'Remises et livraison offerte',
    subheadline:
      'Les lots te font économiser dès que tu commandes plusieurs sets, et la livraison offerte s’active automatiquement dès que tu atteins le montant prévu.',
    volumeTitle: 'Remises volume',
    volumeLead: 'Plus tu commandes de sets, plus tu économises.',
    volumeTier: (qty, percent) => `${qty} sets −${percent} %`,
    volumeJoin: ' · ',
    volumeHint: 'La barre du panier monte à chaque set ajouté.',
    freeShippingTitle: 'Livraison',
    freeShippingLead: (amount) => `Livraison offerte dès ${amount} de marchandise.`,
    freeShippingHint: 'Le seuil dépend du pays de livraison.',
    genericBody:
      'Des remises sur les lots de sets et la livraison offerte à partir d’un certain montant t’attendent dans le panier.',
  },
  loyalty: {
    title: 'Cagnotte',
    headline: 'Gagne du crédit sur tes commandes',
    body: 'Avec un compte, tu cumules du crédit fidélité sur tes commandes et tu peux l’utiliser sur un prochain panier.',
  },
  custom: {
    title: 'Sur-mesure',
    headline: 'Taille ou design personnalisé',
    body: 'Une taille ou un design qui n’est pas en boutique ? Écris-moi depuis la page Contact : on regarde ensemble ce qui est réalisable.',
  },
};
