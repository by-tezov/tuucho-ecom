export interface GiftCreateStepStrings {
  n: string;
  title: string;
  text: string;
}

export interface GiftNextStepStrings {
  n: string;
  text: string;
}

export interface GiftStrings {
  createEyebrow: string;
  createHeadline: string;
  createLead: string[];
  seoCreateTitle: string;
  seoCreateDesc: string;
  howTitle: string;
  howSteps: GiftCreateStepStrings[];
  handoffTitle: string;
  handoffLead: string;
  handoffCardTitle: string;
  handoffCardText: string;
  handoffPinTitle: string;
  handoffPinText: string;
  whoTitle: string;
  whoHint: string;
  giverEmailLabel: string;
  giverEmailHint: string;
  giverNameLabel: string;
  receiverNameLabel: string;
  budgetTitle: string;
  budgetLead: string;
  maxBudgetLabel: string;
  budgetDecreaseAria: string;
  budgetIncreaseAria: string;
  giverCommentLabel: string;
  giverCommentHint: string;
  shareCardStyleLabel: string;
  shareCardQrPreviewAlt: string;
  shareCardUseBefore: string;
  cardPanelTitle: string;
  cardPanelHint: string;
  cardPanelFoot: string;
  shareCardStyles: {
    pamsurin: string;
    anniversaire: string;
    mariage: string;
    fete: string;
    noel: string;
    valentin: string;
    meres: string;
    merci: string;
    diplome: string;
    amitie: string;
    minimal: string;
    coquin: string;
    manga: string;
    halloween: string;
    nouvelan: string;
    artdeco: string;
    botanique: string;
    neon: string;
    celeste: string;
    fantastique: string;
  };
  allowAccessoriesLabel: string;
  allowAccessoriesHint: string;
  maxAccessoryBudgetLabel: string;
  hidePricesLabel: string;
  hidePricesHint: string;
  pinTitle: string;
  pinLead: string;
  pinRememberHint: string;
  createLegalNote: string;
  submitHint: string;
  submitCreate: string;
  creating: string;
  createdEyebrow: string;
  createdHeadline: string;
  createdMailNote: string[];
  createdCardLegend: string;
  createdUnderstood: string;
  pinShareTitle: string;
  pinShareBody: string;
  pinShareHint: string;
  nextTitle: string;
  nextSteps: GiftNextStepStrings[];
  nextFoot: string;
  checkEmail: string;
  fieldRequired: string;
  fieldEmailInvalid: string;
  fieldBudgetInvalid: string;
  fieldAccessoryBudgetRequired: string;
  fieldCommentTooLong: string;
  fieldBudgetCeiling: string;
  fieldBudgetMin: string;
  budgetSetsUpTo: string;
  budgetSetsOne: string;
  budgetSetsNone: string;
  budgetShippingHint: string;
  pinLabel: string;
  pinConfirmLabel: string;
  pinMismatch: string;
  pinInvalid: string;
  pinModalTitle: string;
  pinModalBody: string;
  pinModalConfirm: string;
  pinModalClose: string;
  receiverEnterLoading: string;
  pinBlockedTitle: string;
  pinBlockedBody: string;
  pinBlockedCta: string;
  pinWrong: string;
  pinLocked: string;
  pinWait: string;
  pinThrottleAlert: string;
  genericError: string;
  invalidRequestError: string;
  sessionExpiredError: string;
  serverError: string;
  timeoutError: string;
  rateLimitedError: string;
  loadError: string;
  goneTitle: string;
  goneBody: string;
  inactiveTitle: string;
  inactiveBody: string;
  receiverHello: string;
  remainingBudget: string;
  remainingAccessoryBudget: string;
  budgetExhausted: string;
  budgetExhaustedFrom: string;
  budgetExhaustedCta: string;
  recapFromLabel: string;
  recapMessageLabel: string;
  /** Required email in the receiver cart summary, above confirm. */
  receiverEmailLabel: string;
  receiverEmailHint: string;
  confirmCta: string;
  confirming: string;
  confirmedNotice: string;
  followTitle: string;
  followSubtitle: string;
  followPendingNumber: string;
  statusAwaitingPayment: string;
  statusPaying: string;
  drawerGoToFollow: string;
  emptyBasket: string;
  destinationTitle: string;
  saveDestination: string;
  phoneLabel: string;
  galleryTitle: string;
  giverTitle: string;
  cancelCta: string;
  cancelConfirmTitle: string;
  cancelConfirmBody: string;
  /** LoadingModal while the giver cancel request and cart refresh run. */
  cancelling: string;
  lockedBanner: string;
  continueTitle: string;
  continueBody: string;
  bannerFrom: string;
  confirmTitle: string;
  confirmBody: string;
  drawerGoToCart: string;
  cartTileName: string;
  cartTileFallback: string;
  statusWaitingReceiver: string;
  statusWaitingPayment: string;
  unlockCart: string;
  unlockCartHint: string;
  selectingLockedNote: string;
  reminderStatus: string;
  reminderExpiresAt: string;
  reminderWho: string;
  reminderBudget: string;
  reminderAccessoryBudget: string;
  reminderAccessoriesNone: string;
  reminderAccessoriesYes: string;
  giverEnterLoading: string;
  emptyWaitingReceiver: string;
  emptyWaitingGiverCleared: string;

  shareCardDownloadCta: string;

  shareCardModalTitle: string;

  shareCardFormatLabel: string;

  shareCardFormatPdf: string;

  shareCardFormatJpg: string;

  shareCardDownloadAction: string;

  shareCardEmailAction: string;

  shareCardEmailSentNote: string;

  shareCardDownloadLoading: string;

  shareCardEmailLoading: string;

  shareCardDownloaded: string;

  extendCta: string;

  extendLoading: string;

  extendDone: string;

  extendLimit: string;
}
