export interface ContactStrings {
  eyebrow: string;
  title: string;
  sub: string;
  /** Guest-only, shown under `sub` — nudges toward logging in for the
   * account chat instead of the one-off anonymous form. */
  guestLoginHint: string;
  emailCta: string;
  pageCta: string;
  formTitle: string;
  emailLabel: string;
  identityLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  emailRequiredError: string;
  emailInvalidError: string;
  identityRequiredError: string;
  messageRequiredError: string;
  submit: string;
  submitting: string;
  success: string;
  /** `{email}` — reply address shown under the success message. */
  successReplyTo: string;
  errorGeneric: string;
  errorUnavailable: string;
  errorRateLimited: string;
  attachImagesLabel: string;
  attachImagesHint: string;
  attachRemoveAria: string;
  attachmentLabel: string;
  errorImageTooLarge: string;
  errorImageTooMany: string;
  errorImageInvalidType: string;
  /** `{percent}` = 0–100 while multipart upload runs. */
  uploadProgress: string;
  chatSend: string;
  chatSending: string;
  chatClose: string;
  chatPlaceholder: string;
  chatSpaceTitle: string;
  /** Short, casual — reply-time expectation + email-notification note,
   * shown under chatSpaceTitle in the account chat panel. */
  chatSpaceIntro: string;
  chatNewConversation: string;
  chatHistoryTitle: string;
  chatHistoryIntro: string;
  chatHistoryEmpty: string;
  chatLoadOlder: string;
  chatLoadingOlder: string;
  chatActiveStatus: string;
  chatClosedStatus: string;
  chatFirstMessageDate: string;
  chatLastMessageDate: string;
  chatMessageCount: string;
  chatMessagesCount: string;
  chatReadOnly: string;
}
