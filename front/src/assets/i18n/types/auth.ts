export interface AuthStrings {
  modalTitleLogin: string;
  /** Welcome under login title: greeting, atelier blurb, sign-in prompt, warm closing (right-aligned). */
  loginWelcome: [string, string, string, string];
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  showPasswordAria: string;
  hidePasswordAria: string;
  confirmPasswordLabel: string;
  rememberMeLabel: string;
  backToLogin: string;
  submitLogin: string;
  /** Non-dismissible loading overlay while login submit is in flight. */
  loadingLogin: string;
  /** In-modal wait while public shop sign-in methods are fetched. */
  loadingSignInMethods: string;
  /** Non-dismissible loading overlay while register submit is in flight. */
  loadingRegister: string;
  gdprConsentPrefix: string;
  gdprConsentAnd: string;
  gdprConsentRequiredError: string;
  orContinueWith: string;
  googleConsentTitle: string;
  /** Short explanation under the consent-step title (Google / password create). */
  googleConsentBody: string;
  googleConsentSubmit: string;
  /** Decline control on the consent step — leaves without creating the account. */
  googleConsentDecline: string;
  errorGoogleToken: string;
  errorGoogleDisabled: string;
  continueWithGoogle: string;
  signInWithGoogle: string;
  signUpWithGoogle: string;
  continueWithApple: string;
  appleConsentBody: string;
  appleConsentSubmit: string;
  appleConsentDecline: string;
  errorAppleToken: string;
  errorAppleDisabled: string;
  errorAppleEmailRequired: string;
  continueWithFacebook: string;
  facebookConsentBody: string;
  facebookConsentSubmit: string;
  facebookConsentDecline: string;
  errorFacebookToken: string;
  errorFacebookDisabled: string;
  errorFacebookEmailRequired: string;
  socialAccountChoiceEmailLabel: string;
  socialAccountChoicePrompt: string;
  socialAccountChoiceCreate: string;
  socialAccountChoiceLink: string;
  socialAccountChoiceLinkHint: string;
  socialAccountChoiceConsentBody: string;
  errorSocialAccountNotFound: string;
  /** Vague copy when linking a social identity fails (already linked / conflict). */
  errorSocialLinkImpossible: string;
  facebookDataDeletionTitle: string;
  facebookDataDeletionLoading: string;
  facebookDataDeletionNotFound: string;
  facebookDataDeletionCodeLabel: string;
  facebookDataDeletionStatusScheduled: (date: string) => string;
  facebookDataDeletionStatusUnlinked: string;
  facebookDataDeletionStatusNoAccount: string;
  /** Email-auth button on the social-first connect screen. */
  continueWithEmail: string;
  registerPasswordlessPrompt: string;
  /** Prompt + link shown under the email field when OTP (no password) is selected. */
  usePasswordInsteadPrompt: string;
  usePasswordInsteadLink: string;
  /** Toggle that reveals the password complexity checklist (collapsed by default). */
  showPasswordRules: string;
  hidePasswordRules: string;
  /** Short label embedded in the password-rules panel separator. */
  passwordRulesTitle: string;
  receiveOtpLink: string;
  otpTitle: string;
  otpLabel: string;
  otpHint: (email: string) => string;
  otpRequestSubmit: string;
  otpSubmit: string;
  otpResend: string;
  /** Shown under the OTP boxes: delivery delay + spam reminder. */
  otpDeliveryNote: string;
  /** Countdown next to resend while the 2-minute lock is active. */
  otpResendCountdown: (minutes: number, seconds: number) => string;
  otpInvalidError: string;
  loadingOtp: (email: string) => string;
  loadingOtpVerify: string;
  otpWelcomeCreated: string;
  otpWelcomeConnected: string;
  emailRequiredError: string;
  registerSuccessCta: string;
  resendConfirmationButton: string;
  resendConfirmationSuccess: string;
  resendConfirmationLimitReached: string;
  passwordComplexityHint: string;
  passwordRuleMinLength: string;
  passwordRuleUppercase: string;
  passwordRuleLowercase: string;
  passwordRuleDigit: string;
  passwordRuleSpecial: string;
  passwordRuleMatch: string;
  passwordMismatchError: string;
  errorInvalidCredentials: string;
  errorAccountLocked: string;
  /** Password login that typed a password cancelled when the account was first
   * linked to a social provider from the sign-in screen (`password_cancelled`,
   * reason `social_link`). */
  errorPasswordCancelledSocial: string;
  /** Same, cancelled by a code sign-in on a never-verified email (reason
   * `email_verification`). */
  errorPasswordCancelledVerification: string;
  /** Indefinite, operator-only lock (see SecurityLockPage) — distinct from
   * errorAccountLocked's temporary failed-login lockout above. */
  errorAccountSecurityLocked: string;
  errorEmailAlreadyUsed: string;
  errorWeakPassword: string;
  errorInvalidRequest: string;
  authServiceBusy: string;
  errorUnlockInvalid: string;
  errorGeneric: string;
  resetPasswordTitle: string;
  resetPasswordSubmit: string;
  resetPasswordSuccess: string;
  resetPasswordInvalidToken: string;
  resetPasswordBackToLogin: string;
  confirmEmailTitle: string;
  confirmEmailSuccess: string;
  confirmEmailChangedSuccess: string;
  confirmEmailAlreadyVerified: string;
  confirmEmailInvalidToken: string;
  confirmEmailChecking: string;
  confirmEmailThanks: string;
  manageOrderTitle: string;
  manageOrderSubmitting: string;
  manageOrderInvalidToken: string;
  manageOrderLocked: string;
  manageOrderLoginCta: string;
  securityLockTitle: string;
  securityLockExplanation: string;
  securityLockConfirmButton: string;
  securityLockSuccess: string;
  securityLockInvalidToken: string;
  closeAria: string;
}
