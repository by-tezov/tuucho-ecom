/** Copy of the account and service emails (accountEmails.ts), in the formal
 * register of the order emails. */
export interface AccountEmailCopy {
  ctaFallbackHint: string;
  contactReply: { subject: string; title: string; hello: string };
  passwordReset: {
    subject: string;
    title: string;
    intro: string;
    followLink: string;
    outro: string;
    cta: string;
  };
  loginCode: {
    subject: string;
    title: string;
    intro: string;
    codeLabel: string;
    outro: string;
    hint: string;
  };
  confirmEmail: { subject: string; title: string; followLink: string; outro: string; cta: string };
  emailChange: {
    subject: string;
    title: string;
    intro: (newEmail: string) => string;
    outro: string;
    lockLabel: string;
    cta: string;
  };
  /** Sent to a super-admin on every sign-in and on every automatic session
   * resume after an idle period, with a lock link. */
  superAdminSignIn: {
    subject: string;
    title: string;
    introSignIn: string;
    introResume: string;
    when: (value: string) => string;
    place: (value: string) => string;
    ipAddress: (value: string) => string;
    device: (value: string) => string;
    unknown: string;
    outro: string;
    lockLabel: string;
    cta: string;
  };
  deletionRequested: { subject: string; title: string; intro: string; outro: (date: string) => string };
  deletionReminder: { title: string; intro: (days: number, date: string) => string; outro: string };
  invoice: {
    title: (orderNumber: string) => string;
    intro: (orderNumber: string) => string;
    guestIntro: (orderNumber: string, manageLabel: string) => string;
    /** The PDF stays French (a French invoice); said so outside French. */
    frenchDocumentNote: string | null;
  };
  orderReceived: {
    title: (orderNumber: string) => string;
    subject: (orderNumber: string) => string;
    intro: string;
    cta: string;
  };
  productRequest: {
    title: string;
    accepted: string;
    refused: string;
    acceptedSubject: string;
    refusedSubject: string;
    article: string;
    size: string;
    quantity: string;
    price: string;
    replyHint: string;
  };
}
