export interface AccountStrings {
  pageTitle: string;
  /** Compact light/dark/system switch beside the account-page title. */
  themeLabel: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  contrastLabel: string;
  contrastSystem: string;
  contrastStandard: string;
  contrastMore: string;
  contrastToggle: string;
  /** Account card that reopens the post-splash shop introduction. */
  onboardingReplayTitle: string;
  onboardingReplayHint: string;
  onboardingReplayButton: string;
  profileDetailsTitle: string;
  emailVerifiedBadge: string;
  emailUnverifiedBadge: string;
  resendConfirmationPrompt: string;
  firstNameLabel: string;
  lastNameLabel: string;
  phoneLabel: string;
  saveButton: string;
  updateButton: string;
  saveSuccess: string;
  firstNameRequiredError: string;
  lastNameRequiredError: string;
  phoneRequiredError: string;
  /** Only France/Belgium phone numbers pass here — there is no address to
   * anchor the check to, so the two countries this actually matters for
   * (Mondial Relay) are named directly. */
  phoneInvalidError: string;
  changeEmailTitle: string;
  newEmailLabel: string;
  newEmailRequiredError: string;
  newEmailInvalidError: string;
  currentPasswordLabel: string;
  changeEmailSubmit: string;
  changeEmailPendingNotice: string;
  recentLoginsTitle: string;
  /** "Plus…" link under the single inline entry — opens RecentLoginsModal
   * with the full list. */
  recentLoginsShowMoreLink: string;
  /** Kind nudge shown under the recent-logins list — suggests a password
   * change if the customer doesn't recognize one of the entries. */
  recentLoginsNotice: string;
  changePasswordTitle: string;
  createPasswordTitle: string;
  passwordlessHint: string;
  /** Combined Google + Apple + Facebook card on Account. */
  signInMethodsSocialTitle: string;
  /** Shared hint under providers in the combined social block. */
  signInMethodsSocialHint: string;
  /** Short line under the Google label in the combined social block. */
  signInMethodGooglePaneHint: string;
  signInMethodApplePaneHint: string;
  signInMethodFacebookPaneHint: string;
  /** Hint when the provider plugin is on but OAuth is not configured. */
  signInMethodUnavailable: string;
  signInMethodUnavailableChip: string;
  /** Google connection card on Account (status / link CTA). */
  signInMethodsTitle: string;
  signInMethodPasswordYes: string;
  signInMethodPasswordNo: string;
  signInMethodGoogleLinked: string;
  /** Body when Google is already linked (same style as passwordlessHint). */
  signInMethodGoogleLinkedHint: string;
  signInMethodGoogleLinkHint: string;
  signInMethodGoogleLinkSuccess: string;
  signInMethodGoogleUnlinkButton: string;
  signInMethodGoogleUnlinkSuccess: string;
  googleEmailChoiceTitle: string;
  googleEmailChoiceMessage: string;
  googleEmailChoiceKeep: string;
  googleEmailChoiceSwitch: string;
  googleEmailSecondaryLabel: string;
  errorGoogleEmailMismatch: string;
  errorGoogleAlreadyLinked: string;
  errorEmailChangePending: string;
  errorEmailAlreadyUsed: string;
  signInMethodsAppleTitle: string;
  signInMethodAppleLinked: string;
  signInMethodAppleLinkedHint: string;
  signInMethodAppleLinkHint: string;
  signInMethodAppleLinkButton: string;
  signInMethodAppleLinkSuccess: string;
  signInMethodAppleUnlinkButton: string;
  signInMethodAppleUnlinkSuccess: string;
  appleEmailChoiceTitle: string;
  appleEmailChoiceMessage: string;
  appleEmailChoiceKeep: string;
  appleEmailChoiceSwitch: string;
  appleEmailSecondaryLabel: string;
  errorAppleEmailMismatch: string;
  errorAppleAlreadyLinked: string;
  signInMethodsFacebookTitle: string;
  signInMethodFacebookLinked: string;
  signInMethodFacebookLinkedHint: string;
  signInMethodFacebookLinkHint: string;
  signInMethodFacebookLinkButton: string;
  signInMethodFacebookLinkSuccess: string;
  signInMethodFacebookUnlinkButton: string;
  signInMethodFacebookUnlinkSuccess: string;
  facebookEmailChoiceTitle: string;
  facebookEmailChoiceMessage: string;
  facebookEmailChoiceKeep: string;
  facebookEmailChoiceSwitch: string;
  facebookEmailSecondaryLabel: string;
  errorFacebookAlreadyLinked: string;
  unlockOtpPrompt: (email: string) => string;
  newPasswordLabel: string;
  confirmNewPasswordLabel: string;
  newPasswordRequiredError: string;
  confirmNewPasswordRequiredError: string;
  changePasswordSubmit: string;
  changePasswordSuccess: string;
  deleteAccountTitle: string;
  deleteAccountWarning: string;
  deleteAccountConfirmButton: string;
  deleteAccountConfirmPhrase: string;
  deleteAccountConfirmPhraseHint: string;
  deleteAccountCancelButton: string;
  deletionScheduledPrefix: string;
  cancelDeletionButton: string;
  reactivatedWelcomeBack: string;
  unlockButton: string;
  unlockConfirmButton: string;
  unlockCancelButton: string;

  recentLoginsUnknownPlace: string;
}
