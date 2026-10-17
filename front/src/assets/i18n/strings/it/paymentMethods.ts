import type { Strings } from '../../types';

export const paymentMethods: Strings['paymentMethods'] = {
  pageTitle: 'I miei metodi di pagamento',
  pageSubtitle:
    'Salva qui la tua carta e scegli i tuoi metodi di pagamento per ritrovarli rapidamente a ogni ordine.',
  addButton: 'Aggiungi una carta bancaria',
  deleteButton: 'Elimina',
  deleteConfirm: 'Eliminare questa carta?',
  emptyState: 'Non hai ancora salvato nessuna carta.',
  addCardModalTitle: 'Aggiungi una carta bancaria',
  cardholderNameLabel: 'Nome del titolare della carta',
  cardholderNamePlaceholder: 'Es. Mario Rossi',
  cardholderNameRequiredError: 'Inserisci il nome del titolare della carta.',
  rememberCardLabel: 'Desidero memorizzare questa carta per i miei prossimi acquisti.',
  useCardButton: 'Usa questa carta',
  saveCardButton: 'Salva carta',
  savingCardButton: 'Salvataggio…',
  preparingCardForm: 'Preparazione del modulo sicuro…',
  saveCardError: 'Non è stato possibile salvare la carta. Riprova.',
  expiresLabel: 'Scade',
  paypalDescription: 'Pagamento sicuro con PayPal.',
  googlePayDescription: 'Pagamento sicuro con Google Pay.',
  applePayDescription: 'Pagamento sicuro con Apple Pay.',
  bancontactDescription: 'Pagamento diretto sicuro con Bancontact (Belgio / EUR).',
  paypalEnableAction: 'Mostra',
  paypalDisableAction: 'Nascondi',
  paypalDisableConfirmTitle: 'Nascondere PayPal?',
  paypalDisableConfirmMessage:
    'Non comparirà più nell’elenco principale del carrello, ma resterà selezionabile in « Altri metodi di pagamento ».',
  bancontactDisableConfirmTitle: 'Nascondere Bancontact?',
  bancontactDisableConfirmMessage:
    'Non comparirà più nell’elenco principale del carrello, ma resterà selezionabile in « Altri metodi di pagamento ».',
  googlePayDisableConfirmTitle: 'Nascondere Google Pay?',
  googlePayDisableConfirmMessage:
    'Non comparirà più nell’elenco principale del carrello, ma resterà selezionabile in « Altri metodi di pagamento ».',
  applePayDisableConfirmTitle: 'Nascondere Apple Pay?',
  applePayDisableConfirmMessage:
    'Non comparirà più nell’elenco principale del carrello, ma resterà selezionabile in « Altri metodi di pagamento ».',
  newCardDescription: 'Inserisci una nuova carta al momento del pagamento.',
  newCardDisableConfirmTitle: 'Nascondere Nuova carta bancaria?',
  newCardDisableConfirmMessage:
    'Non comparirà più nell’elenco principale del carrello, ma resterà selezionabile in « Altri metodi di pagamento ». Le carte già salvate restano visibili.',
  secureDataNotice: 'I tuoi dati bancari sono crittografati e gestiti dal nostro fornitore di pagamenti.',
};
