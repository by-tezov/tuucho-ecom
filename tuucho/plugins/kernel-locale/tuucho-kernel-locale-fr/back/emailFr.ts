import type { EmailStrings } from '@kernel/back/modules/messaging/application/emailStringTypes';

export const frEmail: EmailStrings = {
    orderConfirmation: {
      subject: (orderNumber) => `Confirmation de votre commande ${orderNumber} : Shop`,
      title: 'Votre commande est confirmée !',
      intro: 'Merci pour votre commande. Voici son récapitulatif.',
      itemsHeading: 'Articles commandés',
      subtotalLabel: 'Sous-total',
      shippingLabel: 'Livraison',
      totalLabel: 'Total',
      expressSuffix: ' (Express)',
      rulesDiscountLabel: 'Remise volume',
      freeShippingLabel: 'Gratuit',
      giftFreeLabel: 'Gratuit',
      addressHeading: 'Adresse de livraison',
      billingAddressHeading: 'Adresse de facturation',
      invoiceNotice:
        'Votre facture sera disponible dès réception de votre commande : vous serez averti·e par email dès qu’elle sera prête.',
      guestInvoiceNotice:
        'Vous recevrez votre facture par email dès que la réception de votre commande sera confirmée.',
      loginSuggestion:
        'Si cet email ne s’affiche pas correctement, connectez-vous à votre compte sur le site pour retrouver le détail de votre commande.',
      loginLinkLabel: 'Voir mes commandes',
      guestAccountSuggestion:
        'Vous avez commandé sans créer de compte. Utilisez « Gérer ma commande » pour suivre cette commande (lien valable 24 h).',
      guestAccountLinkLabel: 'Gérer ma commande',
      integrityLabel: 'Code d’intégrité :',
      loyaltyCreditLabel: 'Crédit fidélité',
      loyaltyEarnLabel: 'Cagnotte à gagner',
      loyaltyEarnNotice: (amount) =>
        `Tu gagneras ${amount} € dans ta cagnotte une fois la réception confirmée.`,
      loyaltyEarnNoticeGuest: (amount) =>
        `Tu gagneras ${amount} € dans ta cagnotte une fois la réception confirmée. Pour en profiter, crée un compte (ou connecte-toi) avec la même adresse e-mail et rattache cette commande.`,
      footer: 'Cet email est envoyé automatiquement par Shop, merci de ne pas y répondre.',
    },
    orderShipped: {
      subject: (orderNumber) => `Votre commande ${orderNumber} a été envoyée : Shop`,
      title: 'Votre commande est en route !',
      intro: 'Bonne nouvelle : votre commande vient d’être envoyée.',
      itemsHeading: 'Articles expédiés',
      totalLabel: 'Total',
      addressHeading: 'Adresse de livraison',
      billingAddressHeading: 'Adresse de facturation',
      siteLinkLabel: 'Visiter Shop',
      footer: 'Cet email est envoyé automatiquement par Shop, merci de ne pas y répondre.',
    },
    orderCancelled: {
      subject: (orderNumber) => `Annulation de votre commande ${orderNumber} : Shop`,
      title: 'Votre commande a été annulée : aucun paiement effectué',
      intro: 'Nous confirmons l’annulation de votre commande.',
      body: 'Aucun paiement n’a été effectué et aucun montant ne sera prélevé. L’autorisation de paiement a été levée.',
      loginLinkLabel: 'Voir mes commandes',
      footer: 'Cet email est envoyé automatiquement par Shop, merci de ne pas y répondre.',
    },
    orderUpdated: {
      subject: (orderNumber) => `Mise à jour de votre commande ${orderNumber} : Shop`,
      title: 'Votre commande a été mise à jour',
      intro:
        'Nous confirmons que l’adresse de votre commande a été modifiée. Voici son récapitulatif à jour.',
      notice: 'Ce récapitulatif remplace les informations d’adresse de votre précédent email de commande.',
    },
    loyaltyExpiryReminder: {
      subject: (expiresAt) => `Rappel : utilise ton crédit fidélité avant le ${expiresAt}`,
      title: 'Votre crédit fidélité expire bientôt',
      body: (atRisk, expiresAt) =>
        `Il vous reste ${atRisk} € à dépenser avant le règlement du ${expiresAt}. Passé cette date, le crédit non utilisé sera perdu.`,
      ctaLabel: 'Voir ma cagnotte',
      footer: 'Cet email est envoyé automatiquement par Shop, merci de ne pas y répondre.',
    },
    itemGroupLabels: {
      nail: 'Pieces',
      customSet: 'Ensembles',
      accessory: 'Accessoires',
      gift: 'Cadeaux offerts',
    },
    itemLabels: {
      comment: 'Commentaire',
      size: 'taille',
      ref: 'Réf.',
    },
  };
