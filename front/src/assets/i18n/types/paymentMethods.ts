export interface PaymentMethodsStrings {
  pageTitle: string;
  pageSubtitle: string;
  addButton: string;
  deleteButton: string;
  deleteConfirm: string;
  emptyState: string;
  addCardModalTitle: string;
  /** Required — sent to Stripe as billing_details.name. */
  cardholderNameLabel: string;
  cardholderNamePlaceholder: string;
  cardholderNameRequiredError: string;
  rememberCardLabel: string;
  /** Checkout add-card confirm — card may or may not be remembered. */
  useCardButton: string;
  saveCardButton: string;
  savingCardButton: string;
  /** Brief loading state while Stripe prepares a new SetupIntent. */
  preparingCardForm: string;
  /** Retryable failure after Stripe tokenization or server registration. */
  saveCardError: string;
  expiresLabel: string;
  paypalDescription: string;
  /** Short muted line under the Google Pay / Apple Pay rows (cart radio and
   * payment-methods preference cards — same role as paypalDescription). */
  googlePayDescription: string;
  applePayDescription: string;
  bancontactDescription: string;
  /** Action-zone label next to the enable/disable switch — reflects what
   * clicking it will do, same action-verb convention as the other buttons
   * in that row (edit/delete/set default). Shared by PayPal / Google Pay /
   * Apple Pay / Bancontact preference cards. */
  paypalEnableAction: string;
  paypalDisableAction: string;
  paypalDisableConfirmTitle: string;
  paypalDisableConfirmMessage: string;
  bancontactDisableConfirmTitle: string;
  bancontactDisableConfirmMessage: string;
  googlePayDisableConfirmTitle: string;
  googlePayDisableConfirmMessage: string;
  applePayDisableConfirmTitle: string;
  applePayDisableConfirmMessage: string;
  /** Profile preference row for the cart "Nouvelle carte" choice. */
  newCardDescription: string;
  newCardDisableConfirmTitle: string;
  newCardDisableConfirmMessage: string;
  secureDataNotice: string;
}
