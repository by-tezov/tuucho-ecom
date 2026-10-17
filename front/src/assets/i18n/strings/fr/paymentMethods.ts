import type { Strings } from '../../types';

export const paymentMethods: Strings['paymentMethods'] = {
  pageTitle: 'Mes moyens de paiement',
  pageSubtitle:
    'Enregistre ici ta carte et choisis tes moyens de paiement pour les retrouver rapidement à chaque commande.',
  addButton: 'Ajouter une carte bancaire',
  deleteButton: 'Supprimer',
  deleteConfirm: 'Supprimer cette carte ?',
  emptyState: 'Tu n’as pas encore enregistré de carte.',
  addCardModalTitle: 'Ajouter une carte bancaire',
  cardholderNameLabel: 'Nom du titulaire de la carte',
  cardholderNamePlaceholder: 'Ex. Jean Dupont',
  cardholderNameRequiredError: 'Indique le nom du titulaire de la carte.',
  rememberCardLabel: 'Je souhaite mémoriser cette carte pour mes prochains achats.',
  useCardButton: 'Utiliser cette carte',
  saveCardButton: 'Enregistrer la carte',
  savingCardButton: 'Enregistrement…',
  preparingCardForm: 'Préparation du formulaire sécurisé…',
  saveCardError: 'L’enregistrement de la carte a échoué. Réessaie.',
  expiresLabel: 'Expire',
  paypalDescription: 'Paiement sécurisé avec PayPal.',
  googlePayDescription: 'Paiement sécurisé avec Google Pay.',
  applePayDescription: 'Paiement sécurisé avec Apple Pay.',
  bancontactDescription: 'Paiement direct sécurisé avec Bancontact (Belgique / EUR).',
  paypalEnableAction: 'Montrer',
  paypalDisableAction: 'Cacher',
  paypalDisableConfirmTitle: 'Cacher PayPal ?',
  paypalDisableConfirmMessage:
    'Il n’apparaîtra plus dans la liste principale du panier, mais restera sélectionnable via « Autres moyens de paiement ».',
  bancontactDisableConfirmTitle: 'Cacher Bancontact ?',
  bancontactDisableConfirmMessage:
    'Il n’apparaîtra plus dans la liste principale du panier, mais restera sélectionnable via « Autres moyens de paiement ».',
  googlePayDisableConfirmTitle: 'Cacher Google Pay ?',
  googlePayDisableConfirmMessage:
    'Il n’apparaîtra plus dans la liste principale du panier, mais restera sélectionnable via « Autres moyens de paiement ».',
  applePayDisableConfirmTitle: 'Cacher Apple Pay ?',
  applePayDisableConfirmMessage:
    'Il n’apparaîtra plus dans la liste principale du panier, mais restera sélectionnable via « Autres moyens de paiement ».',
  newCardDescription: 'Saisir une nouvelle carte au moment du paiement.',
  newCardDisableConfirmTitle: 'Cacher Nouvelle carte bancaire ?',
  newCardDisableConfirmMessage:
    'Elle n’apparaîtra plus dans la liste principale du panier, mais restera sélectionnable via « Autres moyens de paiement ». Tes cartes déjà enregistrées restent visibles.',
  secureDataNotice: 'Tes données bancaires sont chiffrées et gérées par notre prestataire de paiement.',
};
