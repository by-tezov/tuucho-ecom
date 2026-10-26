import type { Strings } from '@kernel/front/assets/i18n/types';

export const paymentMethods: Strings['paymentMethods'] = {
  pageTitle: 'My Payment Methods',
  pageSubtitle:
    'Save your card here and choose your payment methods so you can find them quickly with every order.',
  addButton: 'Add a bank card',
  deleteButton: 'Delete',
  deleteConfirm: 'Delete this card?',
  emptyState: 'You have no saved card yet.',
  addCardModalTitle: 'Add a bank card',
  cardholderNameLabel: 'Cardholder name',
  cardholderNamePlaceholder: 'E.g. John Smith',
  cardholderNameRequiredError: 'Please enter the cardholder name.',
  rememberCardLabel: 'I want to remember this card for my next purchases.',
  useCardButton: 'Use this card',
  saveCardButton: 'Save card',
  savingCardButton: 'Saving…',
  preparingCardForm: 'Preparing the secure form…',
  saveCardError: 'The card could not be saved. Please try again.',
  expiresLabel: 'Expires',
  paypalDescription: 'Secure payment with PayPal.',
  googlePayDescription: 'Secure payment with Google Pay.',
  applePayDescription: 'Secure payment with Apple Pay.',
  bancontactDescription: 'Secure direct payment with Bancontact (Belgium / EUR).',
  paypalEnableAction: 'Show',
  paypalDisableAction: 'Hide',
  paypalDisableConfirmTitle: 'Hide PayPal?',
  paypalDisableConfirmMessage:
    'It will no longer appear in the cart’s main list, but you can still choose it under “Other payment methods”.',
  bancontactDisableConfirmTitle: 'Hide Bancontact?',
  bancontactDisableConfirmMessage:
    'It will no longer appear in the cart’s main list, but you can still choose it under “Other payment methods”.',
  googlePayDisableConfirmTitle: 'Hide Google Pay?',
  googlePayDisableConfirmMessage:
    'It will no longer appear in the cart’s main list, but you can still choose it under “Other payment methods”.',
  applePayDisableConfirmTitle: 'Hide Apple Pay?',
  applePayDisableConfirmMessage:
    'It will no longer appear in the cart’s main list, but you can still choose it under “Other payment methods”.',
  newCardDescription: 'Enter a new card when you pay.',
  newCardDisableConfirmTitle: 'Hide New bank card?',
  newCardDisableConfirmMessage:
    'It will no longer appear in the cart’s main list, but you can still choose it under “Other payment methods”. Your saved cards stay visible.',
  secureDataNotice: 'Your banking data is encrypted and managed by our payment provider.',
};
