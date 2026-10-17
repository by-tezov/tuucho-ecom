export interface AddressStrings {
  pageTitle: string;
  pageSubtitle: string;
  livraisonSectionTitle: string;
  facturationSectionTitle: string;
  /** "Mode de livraison" default-courier block on the addresses page. */
  courierSectionTitle: string;
  courierSectionHelp: string;
  /** Link shown on a courier tile that isn't the default yet. Badge shown
   * inline with the title on the tile that is the default reuses the
   * generic defaultBadge below (see AccountAddressesPage.tsx) — a
   * dedicated courier-specific copy of that string previously drifted out
   * of sync with it, so there's deliberately only one key now. */
  courierSetDefaultLink: string;
  courierEnableAction: string;
  courierDisableAction: string;
  courierDisableConfirmTitle: string;
  courierDisableConfirmMessage: string;
  /** Generic "Confirmer" — shared by both conflict modals below. */
  confirmButton: string;
  /** Shown when setting a default livraison address that doesn't fit the
   * current default courier — confirming clears the default courier. */
  addressCourierConflictTitle: string;
  addressCourierConflictMessage: string;
  /** Shown when setting a default courier that doesn't fit the current
   * default livraison address — confirming clears the default address. */
  courierAddressConflictTitle: string;
  courierAddressConflictMessage: string;
  addButton: string;
  /** Add-address card in the livraison/facturation sections respectively —
   * more specific than the modal's own generic addButton title, since
   * having two identical "+" buttons on the same page reads as ambiguous.
   * Also used as AddressFormModal title when creating that kind. */
  addLivraisonButton: string;
  addFacturationButton: string;
  /** Short label for edit affordances (aria-label / link text). */
  editButton: string;
  /** AddressFormModal titles when editing a livraison / facturation address. */
  editLivraisonTitle: string;
  editFacturationTitle: string;
  cancelButton: string;
  saveButton: string;
  /** LoadingModal copy while an address create/update request is in flight. */
  savingAddressButton: string;
  /** Retryable error shown in the address form without discarding its values. */
  saveError: string;
  deleteButton: string;
  deleteConfirm: string;
  /** Shown on a livraison address that only matches user-disabled couriers —
   * the card stays for deletion; edit / default / add for that method are off. */
  deleteOnlyHint: string;
  setDefaultButton: string;
  defaultBadge: string;
  labelField: string;
  /** Usual names people give a saved address (home, work, …), offered as a
   * suggestion list under labelField. Free text stays allowed, so this is a
   * shortcut list rather than a closed set of values. */
  labelSuggestions: string[];
  /** aria-label of the chevron that opens/closes that suggestion list. */
  labelSuggestionsToggle: string;
  labelHint: string;
  /** Link shown above recipientNameField to reveal companyNameField. */
  addCompanyLink: string;
  companyNameField: string;
  /** Link next to companyNameField that reverts to an individual (clears
   * companyName, makes recipientNameField required again). Also reused to
   * collapse the optional line2Field. */
  removeCompanyLink: string;
  recipientNameField: string;
  line1Field: string;
  line2Field: string;
  /** Link shown under line1Field to reveal the optional line2Field. */
  addLine2Link: string;
  /** Optional complementary delivery instructions (livraison only). */
  deliveryNotesField: string;
  addDeliveryNotesLink: string;
  deliveryNotesHint: string;
  /** Checkout add-address — same idea as paymentMethods.rememberCardLabel. */
  rememberAddressLabel: string;
  postalCodeField: string;
  cityField: string;
  countryField: string;
  phoneField: string;
  networkField: string;
  homeDeliveryOption: string;
  pickupDeliveryOption: string;
  /** Mobile-only cancel above the page title — leaves the picker without
   * choosing a point (see MondialRelayPickerPage.tsx). */
  mondialRelayBackButton: string;
  mondialRelayPickerTitle: string;
  mondialRelayPickerLoading: string;
  mondialRelayPickerError: string;
  mondialRelaySearchField: string;
  /** Shown inside the map's reserved area before the first search — see
   * MondialRelayPickerModal.tsx's mapPlaceholder. */
  mondialRelaySearchPrompt: string;
  mondialRelayCountryFrance: string;
  mondialRelayCountryBelgium: string;
  mondialRelayCountryLuxembourg: string;
  mondialRelayCountryNetherlands: string;
  mondialRelayCountrySpain: string;
  mondialRelayCountryPortugal: string;
  mondialRelayCountryItaly: string;
  mondialRelayValidationTitle: string;
  mondialRelayNoSelectedPoint: string;
  mondialRelaySelectedPoint: string;
  mondialRelayConfirmButton: string;
  mondialRelaySelectPointError: string;
  mondialRelayOpeningHoursTitle: string;
  mondialRelayClosed: string;
  mondialRelayCheckOpeningHours: string;
  mondialRelayShowLessHours: string;
  /** Mobile-only bottom sheet showing the point list (see
   * MondialRelayPickerModal.tsx) — title and the floating button that
   * reopens it once the customer has closed it. */
  mondialRelaySheetTitle: string;
  mondialRelayReopenListAria: string;
  recipientNameRequiredError: string;
  companyNameRequiredError: string;
  line1RequiredError: string;
  postalCodeRequiredError: string;
  cityRequiredError: string;
  countryRequiredError: string;
  phoneRequiredError: string;
  /** Takes the delivery country's display name — the number must belong to
   * that country, not just be well-formed. */
  phoneInvalidError: (country: string) => string;
  /** Static gray hint under the phone field, replaced by phoneInvalidError
   * once the field is actually invalid. */
  phoneHint: string;
  /** Shown under recipientNameField once company mode is on — recipient is
   * optional then, but still useful so the parcel reaches the right person. */
  recipientNameCompanyHint: string;
  emptyState: string;

  phoneCountryLabel: string;
}
