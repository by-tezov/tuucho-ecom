import type { GiftReceiverOrderMail } from '@kernel/back/modules/messaging/application/giftReceiverOrderMail';

export const frGiftReceiver: GiftReceiverOrderMail = {
  confirmation: {
    subject: (orderNumber) => `Confirmation de ton cadeau ${orderNumber} : Shop`,
    title: 'Ton cadeau est confirmé',
    intro: 'Voici le récapitulatif de ton cadeau.',
    itemsHeading: 'Ton cadeau',
  },
  shipped: {
    subject: (orderNumber) => `Ton cadeau ${orderNumber} est en route : Shop`,
    title: 'Ton cadeau est en route',
    intro: 'Bonne nouvelle : ton cadeau vient d’être envoyé.',
    itemsHeading: 'Contenu de ton cadeau',
  },
  updated: {
    subject: (orderNumber) => `Mise à jour de ton cadeau ${orderNumber} : Shop`,
    title: 'L’adresse de ton cadeau a été mise à jour',
    intro: 'L’adresse de livraison de ton cadeau a été modifiée. Voici le récapitulatif à jour.',
    notice: 'Ce récapitulatif remplace l’adresse indiquée dans l’email précédent.',
  },
  cancelled: {
    subject: (orderNumber) => `Ton cadeau ${orderNumber} a été annulé : Shop`,
    title: 'Ton cadeau a été annulé',
    intro: 'Le cadeau qui t’était destiné a été annulé.',
    body: 'Aucun envoi n’aura lieu.',
  },
  received: {
    subject: (orderNumber) => `Ton cadeau ${orderNumber} est bien arrivé : Shop`,
    title: 'Ton cadeau est bien arrivé',
    intro: 'La livraison de ton cadeau est indiquée comme reçue.',
  },
};
