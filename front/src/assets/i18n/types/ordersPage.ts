export interface OrdersPageStrings {
  activeTitle: string;
  activeSubtitle: string;
  /** Short labels for OrdersViewSwitch.tsx's mobile-only text switch — no
   * "Commandes"/"orders" prefix, unlike activeTitle/historyTitle, since the
   * page context already makes that obvious. */
  switchActive: string;
  switchHistory: string;
  /** Accessible name for that switch as a whole (SegmentedSwitch's group). */
  switchAria: string;
  historyTitle: string;
  historySubtitle: string;
  emptyActive: string;
  guestOrdersTitle: string;
  guestOrdersDescription: string;
  guestIntegrityLabel: string;
  guestClaimButton: string;
  /** LoadingModal while claimGuestOrder runs after the integrity code submit. */
  guestClaimLoading: string;
  guestIntegrityInvalid: string;
  guestClaimError: string;
  guestNotMine: string;
  guestNotMineTitle: string;
  guestNotMineMessage: string;
  guestNotMineConfirm: string;
  /** LoadingModal while dismissGuestOrder runs after the "not mine" confirm. */
  guestDismissLoading: string;
  emptyHistory: string;
  loadMoreOrders: string;
  loadingMoreOrders: string;
  orderNumberLabel: string;
  statusConfirmed: string;
  statusInPreparation: string;
  statusToSend: string;
  statusSent: string;
  statusDisponible: string;
  statusReceived: string;
  statusCancelled: string;
  statusReturnReview: string;
  totalLabel: string;
  orderDateLabel: string;
  /** "Livraison" row above the total, in the totals block — the courier
   * name (+ express, if any) is appended after this in code, not part of
   * the translated string itself. */
  shippingLabel: string;
  deliveryAddressLabel: string;
  billingAddressLabel: string;
  expressLabel: string;
  /** Lead-in text before the order's HMAC integrity token (see the backend's
   * orders.service.ts computeOrderContentHash) — the token itself is appended
   * after this string, not translated. */
  integrityNoteLabel: string;
  /** Payment capture state shown on the order card. */
  paymentAuthorizedLabel: string;
  paymentCapturedLabel: string;
  paymentNotRequiredLabel: string;
  paymentCanceledLabel: string;
  /** Auth hold ended before capture — funds were never taken. */
  paymentExpiredLabel: string;
  /** Section heading above payment status + method on the order card. */
  paymentSectionTitle: string;
  /** Paid gift order — `{name}` is the destinataire. */
  giftOrderFor: string;
  /** How paid — {brand} and {last4} for cards. */
  paymentMethodCardLabel: string;
  paymentMethodPaypalLabel: string;
  paymentMethodBancontactLabel: string;
  paymentMethodCardUnknownLabel: string;
  /** Accessible label for the empty thumb when the snapshotted photo is missing or failed integrity. */
  photoMissingLabel: string;
  /** Section-divider labels above the nail-set / accessory / gift blocks of
   * an order's item list — singular/plural picked by the section's total
   * quantity (see cartDisplayName.ts's usesSingularItemCount). */
  itemGroupNailsOne: string;
  itemGroupNailsOther: string;
  itemGroupCompositionsOne: string;
  itemGroupCompositionsOther: string;
  itemGroupAccessoriesOne: string;
  itemGroupAccessoriesOther: string;
  itemGroupGiftsOne: string;
  itemGroupGiftsOther: string;
  /** Shown when the order has at least one amendment — {n} = revisionCount. */
  revisionsButton: string;
  revisionsModalTitle: string;
  revisionsModalCloseAria: string;
  revisionsLoading: string;
  revisionsEmpty: string;
  revisionsError: string;
  revisionsKindBilling: string;
  revisionsKindShipping: string;
  revisionsSameAsShipping: string;
  revisionsDistinctBilling: string;
  revisionsIntegrityLabel: string;
  trackPackageButton: string;
  trackPackageTitle: string;
  trackPackageCloseAria: string;
  trackPackageLoading: string;
  trackPackageUnavailable: string;
  trackPackageNotShipped: string;
  trackPackageNoEvents: string;
  trackPackageShipmentNumberLabel: string;
  trackPackageExternalLinkLabel: string;
  cancelOrderButton: string;
  cancelOrderTitle: string;
  cancelOrderConfirm: string;
  cancelOrderConfirmButton: string;
  cancelOrderLoading: string;
  cancelOrderSuccess: string;
  cancelOrderError: string;
  editOrderAddressesTitle: string;
  editOrderSameCourierNote: string;
  editOrderShippingRequired: string;
  editOrderNoShippingAddress: string;
  editOrderCourierIncompatible: string;
  editOrderPriceWouldChange: string;
  /** Shown while the billing edit dialog is open — {minutes} is remaining lock time. */
  editOrderSaveButton: string;
  /** Tag on the address the order currently uses. */
  editOrderCurrentAddress: string;
  editOrderBillingHeading: string;
  editOrderSameAsShippingLabel: string;
  editOrderNoBillingAddress: string;
  editOrderBillingRequired: string;
  editOrderLockExpired: string;
  editOrderConflict: string;
  editOrderInvoiceBlocked: string;
  /** Customer address-amendment cap reached for this order. */
  editOrderRevisionLimit: string;
  editOrderNotEditable: string;
  editOrderError: string;
  myInvoiceButton: string;
  invoiceModalTitle: string;
  invoiceModalCloseAria: string;
  invoiceDownloadButton: string;
  invoiceEmailButton: string;
  invoiceDownloadLoading: string;
  invoiceEmailLoading: string;
  invoiceDownloaded: string;
  invoiceEmailSent: string;
  invoiceRateLimitedDownload: string;
  invoiceRateLimitedEmail: string;
  rebuyButton: string;

  showCommentLink: string;

  hideCommentLink: string;
}
