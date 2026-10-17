import type { Strings } from '../../types';

export const paymentMethods: Strings['paymentMethods'] = {
  pageTitle: 'Mijn betaalmethoden',
  pageSubtitle:
    'Bewaar hier je kaart en kies je betaalmethoden om ze snel terug te vinden bij elke bestelling.',
  addButton: 'Een bankkaart toevoegen',
  deleteButton: 'Verwijderen',
  deleteConfirm: 'Deze kaart verwijderen?',
  emptyState: 'Je hebt nog geen kaart opgeslagen.',
  addCardModalTitle: 'Een bankkaart toevoegen',
  cardholderNameLabel: 'Naam van de kaarthouder',
  cardholderNamePlaceholder: 'Bijv. Jan Jansen',
  cardholderNameRequiredError: 'Vul de naam van de kaarthouder in.',
  rememberCardLabel: 'Ik wil deze kaart onthouden voor mijn volgende aankopen.',
  useCardButton: 'Deze kaart gebruiken',
  saveCardButton: 'Kaart opslaan',
  savingCardButton: 'Opslaan…',
  preparingCardForm: 'Beveiligd formulier voorbereiden…',
  saveCardError: 'De kaart kon niet worden opgeslagen. Probeer het opnieuw.',
  expiresLabel: 'Verloopt',
  paypalDescription: 'Veilig betalen met PayPal.',
  googlePayDescription: 'Veilig betalen met Google Pay.',
  applePayDescription: 'Veilig betalen met Apple Pay.',
  bancontactDescription: 'Veilig direct betalen met Bancontact (België / EUR).',
  paypalEnableAction: 'Tonen',
  paypalDisableAction: 'Verbergen',
  paypalDisableConfirmTitle: 'PayPal verbergen?',
  paypalDisableConfirmMessage:
    'Hij verschijnt niet meer in de hoofdlijst van je winkelwagen, maar blijft kiesbaar via « Andere betaalmethoden ».',
  bancontactDisableConfirmTitle: 'Bancontact verbergen?',
  bancontactDisableConfirmMessage:
    'Hij verschijnt niet meer in de hoofdlijst van je winkelwagen, maar blijft kiesbaar via « Andere betaalmethoden ».',
  googlePayDisableConfirmTitle: 'Google Pay verbergen?',
  googlePayDisableConfirmMessage:
    'Hij verschijnt niet meer in de hoofdlijst van je winkelwagen, maar blijft kiesbaar via « Andere betaalmethoden ».',
  applePayDisableConfirmTitle: 'Apple Pay verbergen?',
  applePayDisableConfirmMessage:
    'Hij verschijnt niet meer in de hoofdlijst van je winkelwagen, maar blijft kiesbaar via « Andere betaalmethoden ».',
  newCardDescription: 'Voer een nieuwe kaart in bij het betalen.',
  newCardDisableConfirmTitle: 'Nieuwe bankkaart verbergen?',
  newCardDisableConfirmMessage:
    'Hij verschijnt niet meer in de hoofdlijst van je winkelwagen, maar blijft kiesbaar via « Andere betaalmethoden ». Opgeslagen kaarten blijven zichtbaar.',
  secureDataNotice: 'Uw bankgegevens zijn versleuteld en worden beheerd door onze betalingsprovider.',
};
