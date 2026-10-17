export interface CartStrings {
  iconAria: string;
  popoverContinue: string;
  popoverGoToCart: string;
  bannerText: string;
  /** Appended when loyalty is on and earn preview > 0 — amount sits between prefix and suffix. */
  bannerEarnPrefix: string;
  bannerEarnSuffix: string;
  bannerCta: string;
  /** Plain cart page heading — custom/rebuy cart name sits above as a note. */
  pageTitle: string;
  /** @deprecated Unused — name is shown as a note above `pageTitle` for custom/rebuy carts. */
  /** Label for the account's default cart (`kind: 'default'`). */
  defaultCartName: string;
  wishlistCartName: string;
  /**
   * Label for a guest/unconnected cart landed via login merge (sentinel
   * name `unconnected cart`) — never shown as a CartPage title note.
   */
  guestCartName: string;
  otherCartsTitle: string;
  /** Shown in the non-dismissible overlay while activating another cart. */
  switchingCart: string;
  /** Shown in the non-dismissible overlay while deleting or emptying a cart. */
  deletingCart: string;
  createCart: string;
  createCartDialogTitle: string;
  createCartNamePlaceholder: string;
  createCartConfirm: string;
  /** Empty cart-name validation in create/rename NameDialog. */
  cartNameRequiredError: string;
  renameCart: string;
  renameCartPlaceholder: string;
  deleteCartConfirm: string;
  /** Same delete-tile flow, but the target is the `default` cart — the
   * backend clears its lines instead of removing the row (see
   * DELETE /account/carts/:cartId), so the confirm dialog and its confirm
   * button read as "empty" rather than "delete" to match what actually
   * happens. */
  clearCartConfirm: string;
  clearCartButton: string;
  /** Longer description — e.g. aria / confirm context for merge into active cart. */
  mergeCart: string;
  /** Short label on the other-carts tile merge control (icon + text). */
  mergeButton: string;
  /** Confirm-dialog title before merging a tile cart into the active cart. */
  mergeCartConfirm: string;
  /** Label above the source (tile) cart preview in the merge confirm. */
  mergeCartSourceLabel: string;
  /** Label above the active/target cart preview in the merge confirm. */
  mergeCartTargetLabel: string;
  /** Title for the too-many-carts error dialog (create pre-check / API race). */
  cartLimitTitle: string;
  /** Body for the too-many-carts error; `{max}` is CART_MAX_PER_USER. */
  cartLimitError: string;
  /** Dismiss label on the cart-limit dialog (OK — no cancel). */
  cartLimitOk: string;
  rebuyDialogTitle: string;
  rebuyDialogNew: string;
  rebuyDialogMerge: string;
  rebuyDialogSelect: string;
  rebuyDialogConfirm: string;
  /** Label above the required name field when creating a cart via rebuy. */
  rebuyDialogNameLabel: string;
  rebuyDialogNamePlaceholder: string;
  /** Aria-label for the clear button inside the rebuy cart-name input. */
  rebuyDialogClearNameAria: string;
  /** Shown when confirm is pressed with an empty new-cart name. */
  rebuyDialogNameRequired: string;
  /** Prefill for the new-cart name field; `{orderNumber}` is replaced. */
  rebuyCartNameDefault: string;
  loginMergeTitle: string;
  /** Inline recovery message when saving a chosen guest cart fails. */
  loginMergeError: string;
  cartItemCount: string;
  cartItemsCount: string;
  cartProgressText: string;
  emptyState: string;
  browseGalleryLink: string;
  referenceLabel: string;
  sizeLabel: string;
  quantityLabel: string;
  /** Accessible name for QuantityControl's decrease button. */
  qtyDecreaseAria: string;
  /** Accessible name for QuantityControl's increase button. */
  qtyIncreaseAria: string;
  /** Short "Qté" label used on the drawer's compact cart lines. */
  /** Shown next to the (disabled) quantity control in the zoom modal when
   * only one unit of the selected size is left. */
  lastOneInStockNotice: string;
  /** Suffix after the item title in the drawer's "{title} added to cart" confirmation line. */
  drawerAddedSuffix: string;
  /** Suffix after the item title in the drawer's red "{title} couldn't be added" notice, shown
   * instead of drawerAddedSuffix when there isn't enough stock left to add anything. */
  drawerErrorSuffix: string;
  /** LoadingModal message shown between "Ajouter" and the drawer opening,
   * while its product data is being fetched. */
  drawerLoading: string;
  /** Static note shown in the drawer under the subtotal — never persisted server-side. */
  drawerShippingNote: string;
  /** Second static note under drawerShippingNote — shape/size/quantity stay editable until checkout. */
  drawerModifyNote: string;
  /** Label on the "Plus tard" button below a cart line's photo. */
  removeButton: string;
  deleteButton: string;
  /** Title/text for the "Plus tard" button's confirmation modal
   * (FavoriteOrRemoveModal, no onRemove) — offers only move-to-Wish-List or
   * cancel, since a plain removal is already reachable via the delete icon. */
  keepWishlistTitle: string;
  keepWishlistText: string;
  keepWishlistButton: string;
  /** Title/text for the delete icon's confirmation modal
   * (FavoriteOrRemoveModal, with onRemove) — offers move-to-Wish-List,
   * remove, or cancel (the close icon). */
  deleteLineTitle: string;
  deleteLineText: string;
  /** Delete-dialog text where moving to a Wish List is unavailable (guests
   * and the Wish List itself). */
  deleteLineOnlyText: string;
  /** Shown below a cart line whose quantity is clamped to 0 (out of stock)
   * — informational only, never blocks checkout; see
   * outOfStockConfirmNotice below for the payment-confirmation echo. Also
   * the label of the button that opens OutOfStockModal. */
  outOfStockNotice: string;
  /** OutOfStockModal — reached by clicking that notice. Shows the item
   * (photo, shape, size) and the two ways out: have it made, or remove it. */
  outOfStockModalTitle: string;
  outOfStockModalText: string;
  /** The made-to-order offer inside that modal — worded for a line already
   * in the cart, unlike requestSizeNotice which answers "you just picked a
   * sold-out size". */
  outOfStockModalRequestNotice: string;
  outOfStockRemoveButton: string;
  /** Shown in the card/PayPal payment confirmation dialogs whenever the
   * cart currently has at least one out-of-stock line. */
  outOfStockConfirmNotice: string;
  /** Shown when quantity is already 1 and the customer clicks "−" — asks
   * whether they meant to move it to Wish List or delete it outright, since
   * decrementing further has nowhere to go but one of those two. Same
   * FavoriteOrRemoveModal as the delete icon, just this specific wording. */
  lastUnitTitle: string;
  lastUnitText: string;
  /** Accessible name for the shape picker modal (SelectionPickerModal).
   * Size picker uses changeSizeTitle / changeSizeRequestTitle instead. */
  changeSelectionTitle: string;
  /** Size picker heading while an in-stock size is selected. */
  changeSizeTitle: string;
  /** Size picker heading once a sold-out size is selected — same dialog,
   * title swaps smoothly so vignette/title/shape stay on screen. */
  addAsNewLineButton: string;
  changeThisLineButton: string;
  /** Size picker only: shown in place of the add/replace actions once the
   * selected size is out of stock — the cart's picker keeps sold-out chips
   * visible (unlike the gallery, which hides them) precisely so this offer
   * to have the size made can be reached. */
  requestSizeNotice: string;
  requestSizeButton: string;
  /** Guests have no account address on file, so the request form asks for
   * one — a request nobody can answer would be worse than no request. */
  requestSizeEmailLabel: string;
  /** Reveals an optional note under Quantité on a size request. Rendered
   * with a leading “+”, matching address.addCompanyLink. */
  addCommentLink: string;
  requestCommentLabel: string;
  requestSizeSending: string;
  requestSizeSentTitle: string;
  requestSizeSentText: string;
  requestSizeError: string;
  /** Dismisses the confirmation step and returns to the cart. */
  requestSizeOkButton: string;
  subtotalLabel: string;
  totalLabel: string;
  /** Heading of the sticky order summary card on the cart page. */
  summaryHeading: string;
  summaryPromoDivider: string;
  summaryWalletDivider: string;
  promoCodePlaceholder: string;
  validatePromoButton: string;
  promoCodeApplied: string;
  promoCodeInvalid: string;
  promoCodeNotFound: string;
  promoCodeNotStarted: string;
  promoCodeExpired: string;
  promoCodeDepleted: string;
  promoCodeUserNotAllowed: string;
  promoCodeConditionsNotMet: string;
  /** "Kit de pose offert · fait main" trust line under the summary's Payer
   * button (with secure payment and envoi sous 48h). */
  trustKitIncluded: string;
  /** Line under the pay button; card entry is Stripe Elements, so it is literally true. */
  securePaymentStripe: string;
  acceptedPayments: string;
  addressHeading: string;
  addAddressLink: string;
  /** "Utiliser la même adresse pour la facturation" checkbox in the
   * delivery-address block. */
  sameAsBillingLabel: string;
  billingAddressHeading: string;
  errorBillingAddressRequired: string;
  /** Cart radio for paying with a card collected at confirm time. */
  newCardPaymentMethodLabel: string;
  /** Account payment-methods page add-card button (SetupIntent). */
  addAnotherPaymentMethodLink: string;
  shippingMethodLabel: string;
  /** "Choisir le point" button on the Mondial Relay pickup-point courier row. */
  /** Delivery estimate under a courier's name on the cart page. `{min}`
   * `{max}` are day counts; the `Single` variant is used when they're
   * equal, so no locale has to render "3 to 3 days". */
  courierDeliveryDays: string;
  courierDeliveryDaysSingle: string;
  /** Pickup-point couriers only: how long the parcel waits there before
   * going back. `{days}`. */
  courierCustodyDays: string;
  expressLabel: string;
  shippingFeeLabel: string;
  /** Shown under the selected courier when the shipping fee cannot be
   * resolved yet (no delivery country / address). */
  shippingPricePending: string;
  /** Permanent offers block heading (gifts + volume discount). */
  /** Cart-page accessory upsell heading, after gifts and volume remise. */
  addAccessoriesHeading: string;
  /** Permanent nail-qty % tiers card title. */
  rulesTierTitle: string;
  /** Status when no tier unlocked yet; `{need}` `{percent}`. */
  rulesTierNext: string;
  /** Status when a tier is matched and a higher one remains; `{percent}` `{need}` `{nextPercent}`. */
  rulesTierMatchedNext: string;
  /** Status at top tier; `{percent}` `{qty}`. */
  rulesTierMax: string;
  /** Fallback when no tiers are configured. */
  rulesTierIdle: string;
  /** Spoken form of one volume-discount step: `{qty}` items or more, `{percent}` off. */
  rulesTierStepSpoken: string;
  /** Summary row label for the nail-qty tier discount. */
  rulesTierDiscountLabel: string;
  /** Gift line badge. */
  rulesGiftBadge: string;
  /** Gift line qty caption. */
  rulesGiftIncluded: string;
  /** Price label for free gift / free shipping. */
  rulesFreePrice: string;
  /** Free-shipping (franco) progress title in the courier block. */
  rulesFrancoTitle: string;
  /** Caption under the title; `{current}` `{threshold}` are formatted prices. */
  rulesFrancoLadder: string;
  /** Status while below the country threshold; `{need}` is a formatted price. */
  rulesFrancoNext: string;
  /** Status once franco is unlocked for the delivery country. */
  rulesFrancoMax: string;
  courierUnavailableCountry: string;
  courierUnavailableNetwork: string;
  addressDeselectedNotice: string;
  shapeLabel: string;
  lengthLabel: string;
  /** Shown in place of the size chips for a cart line whose currently
   * selected shape has nothing in stock at all. */
  /** VariantAxisModal headings, shape and length axis respectively. */
  changeShapeTitle: string;
  changeLengthTitle: string;
  /** VariantAxisModal: soft warning next to a size line whose quantity will
   * shrink under the candidate shape/length — followed by the new count. */
  quantityReducedNotice: string;
  /** VariantAxisModal: hard error when a size line has zero stock under the
   * candidate shape/length — a replacement size picker follows it. */
  variantSizeUnavailableNotice: string;
  paymentModalTitle: string;
  /** Expand/collapse extra payment or courier options. */
  overflowMore: string;
  overflowModalPaymentTitle: string;
  overflowModalCourierTitle: string;
  overflowOptionCard: string;
  /** Overflow picker label for the new-card sentinel (distinct from a saved card). */
  overflowOptionNewCard: string;
  payButton: string;
  payingButton: string;
  /** LoadingModal while the backend validates and freezes checkout state. */
  checkoutReservationLoading: string;
  /** Error dialog title when server-side checkout validation/reservation fails. */
  checkoutReservationErrorTitle: string;
  cardPaymentConfirmTitle: string;
  cardPaymentConfirmText: string;
  /** Pay sheet when paying with a card entered now (not a saved card). */
  newCardPaymentConfirmText: string;
  cardPaymentConfirmCardLabel: string;
  /** Guest / unverified-account email shown above the item count in both
   * payment confirm dialogs so the customer sees where the order mail goes. */
  confirmEmailLabel: string;
  cardPaymentConfirmButton: string;
  paypalPaymentConfirmTitle: string;
  paypalPaymentConfirmText: string;
  paypalPaymentConfirmButton: string;
  bancontactPaymentConfirmTitle: string;
  bancontactPaymentConfirmText: string;
  bancontactPaymentConfirmButton: string;
  googlePayPaymentConfirmTitle: string;
  googlePayPaymentConfirmText: string;
  applePayPaymentConfirmTitle: string;
  applePayPaymentConfirmText: string;
  /** Briefly replaces the payment action when its server-side stock hold expires. */
  paymentReservationExpired: string;
  paymentErrorGeneric: string;
  confirmSuccessTitle: string;
  confirmSuccessText: string;
  viewOrdersButton: string;
  continueShoppingButton: string;
  errorEmptyCart: string;
  errorPriceMissing: string;
  errorAddressRequired: string;
  /** The selected address disappeared or belongs to a different checkout
   * session; unlike errorAddressRequired, it was selected in the UI. */
  errorAddressUnavailable: string;
  errorCourierRequired: string;
  errorPaymentMethodRequired: string;
  /** Inlined beside the "Paiement" heading when checkout uses authorize-then-
   * capture (manual capture): funds are taken at parcel preparation, not at
   * order confirmation. Hidden for free / zero-total carts. */
  paymentChargedOnPreparation: string;
  errorCourierUnavailable: string;
  errorShippingOverflow: string;
  errorExpressUnavailable: string;
  errorPaymentMethodCountryUnavailable: string;
  errorPaymentMethodForbidden: string;
  errorPaymentMethodNotAvailable: string;
  errorLoyaltyInsufficient: string;
  errorLoyaltyIncompatibleWithVoucher: string;
  /** Unknown create-intent failure — include the API error code for support. */
  errorPaymentPrepareFailed: (code: string) => string;
  errorSizeUnavailable: string;
  errorGeneric: string;
  /** Fixed card next to the order summary while signed out — see
   * GuestCheckoutPrompt.tsx. Title on the signup and login views; OTP view
   * uses auth.otpTitle instead. */
  guestPromptTitle: string;
  /** Under the Identification title on the signup and login views. */
  guestPromptIdentifyNotice: string;
  guestPromptEmailPlaceholder: string;
  guestPromptEmailAria: string;
  guestPromptEmailRequiredError: string;
  guestPromptEmailInvalidError: string;
  /** Shown below the consent checkbox once an email has been typed but the
   * box isn't checked yet — there's no submit button to gate anymore, this
   * is the only feedback telling the customer why Payer stays disabled. */
  guestPromptConsentRequiredError: string;
  /** Login view's submit button — reads as "log in or create an account"
   * since that view's outcome depends on whether the email already has an
   * account, not on anything the customer can tell in advance. */
  guestPromptLoginSubmit: string;
  /** "Not in the mood to type your password?" — prefix sentence in front of
   * guestPromptOtpLink, same shape as auth.registerPasswordlessPrompt
   * elsewhere in the auth forms. */
  guestPromptOtpPrompt: string;
  /** Cart-scoped "receive a login code by email" link. */
  guestPromptOtpLink: string;
  /** Screen-reader suffix of a picker chip already in the cart (its gold
   * inset border alone says nothing to assistive technologies). */
  pickerCurrentOption: string;
  /** Payment confirmation, shortly before the stock hold expires (RGAA 13.1).
   * `{n}` is the warning lead time in minutes. */
  paymentReservationWarning: string;
  /** The one action that extends the hold (POST …/checkout/extend). */
  paymentReservationExtend: string;
  /** Announced once the hold was extended. */
  paymentReservationExtended: string;
  /** The hold is gone or used its extensions. */
  paymentReservationExtendFailed: string;
  /** Shown instead of an error after a signed-out customer validates a
   * promo code — it's cached, not actually checked, until they log in. */
  /** Radio labels in the signed-out payment-method placeholder — see
   * GuestPaymentMethodPicker.tsx. */
}
