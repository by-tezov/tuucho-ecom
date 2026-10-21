import { appVersion } from '../../../config/appVersion.js';
import { config } from '../../../config/env.js';
import { peekStoreIdentity } from '../../plugins/application/storeSettings.js';
import type { Language } from '../../../utils/language.js';
import { accountEmailCopy, formatEmailDay, formatEmailMoment } from './accountEmailCopy.js';
import { emailStrings } from './emailStrings.js';
import { genericNoticeHtml } from './emailTemplates.js';

/** A built email without its recipient: the shape of email.ts's MailMessage
 * minus `to`, spelled out here so this module does not import email.ts,
 * which re-exports it. */
type MailContent = {
  subject: string;
  text: string;
  html: string;
  kind?: 'user';
  headers?: Record<string, string>;
};

/** Account and service emails, each in the language of the person it goes
 * to: the request's language when they asked for it, their saved
 * preference (or the language they wrote in) when the shop sends it later. */

/** Direct reply to an anonymous contact form message, sent by an admin from
 * the private admin inbox. It intentionally has no inbound marker: ordinary
 * replies remain normal contact email and are handled by the existing mail
 * forwarding path. */
export function unconnectedContactReplyEmail(message: string, language: Language): MailContent {
  const copy = accountEmailCopy(language).contactReply;
  const text = `${copy.hello}\n\n${message}\n\n${peekStoreIdentity().name}`;
  return {
    subject: copy.subject,
    text,
    html: genericNoticeHtml({ language, title: copy.title, paragraphs: text.split('\n').filter(Boolean) }),
    kind: 'user',
  };
}

export function passwordResetEmail(link: string, language: Language): MailContent {
  const { ctaFallbackHint, passwordReset: copy } = accountEmailCopy(language);
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.intro}\n\n${copy.followLink}\n${link}\n\n${copy.outro}`,
    html: genericNoticeHtml({
      language,
      title: copy.title,
      paragraphs: [copy.intro, copy.outro],
      ctaUrl: link,
      ctaLabel: copy.cta,
      ctaFallbackHint,
    }),
  };
}

export function authOtpEmail(code: string, language: Language): MailContent {
  const copy = accountEmailCopy(language).loginCode;
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.intro}\n\n${copy.codeLabel} : ${code}\n\n${copy.outro}`,
    html: genericNoticeHtml({
      language,
      title: copy.title,
      paragraphs: [copy.intro, copy.outro],
      otp: code,
      otpHint: copy.hint,
    }),
  };
}

export function emailConfirmationEmail(link: string, language: Language): MailContent {
  const { ctaFallbackHint, confirmEmail: copy } = accountEmailCopy(language);
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.followLink}\n${link}\n\n${copy.outro}`,
    html: genericNoticeHtml({
      language,
      title: copy.title,
      paragraphs: [copy.outro],
      ctaUrl: link,
      ctaLabel: copy.cta,
      ctaFallbackHint,
    }),
  };
}

/** Sent to the account's CURRENT (not new) address when an email change is
 * requested — see account.routes.ts's /change-email, which also sends
 * emailConfirmationEmail to the new address separately. The lock link fires
 * accountSecurityLock.service.ts's consumeAccountLockToken: no session
 * needed (the real owner may not even be able to log in as themselves
 * anymore if this wasn't them), and once used the account stays locked
 * until an operator reverses it — see POST /operation/accounts/:email/unlock. */
export function emailChangeSecurityNoticeEmail(
  newEmail: string,
  lockUrl: string,
  language: Language,
): MailContent {
  const copy = accountEmailCopy(language).emailChange;
  const intro = copy.intro(newEmail);
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${intro}\n\n${copy.outro}\n\n${copy.lockLabel} :\n${lockUrl}`,
    html: genericNoticeHtml({
      language,
      title: copy.title,
      paragraphs: [intro, copy.outro],
      ctaUrl: lockUrl,
      ctaLabel: copy.cta,
    }),
  };
}

/** `scheduledForDate` is a `YYYY-MM-DD` day. */
export function deletionRequestedEmail(scheduledForDate: string, language: Language): MailContent {
  const copy = accountEmailCopy(language).deletionRequested;
  const visit = emailStrings(language).orderShipped.siteLinkLabel;
  const outro = copy.outro(formatEmailDay(scheduledForDate, language));
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.intro}\n\n${outro}\n\n${visit} :\n${config.frontendBaseUrl}`,
    html: genericNoticeHtml({
      language,
      title: copy.title,
      paragraphs: [copy.intro, outro],
      ctaUrl: config.frontendBaseUrl,
      ctaLabel: visit,
    }),
  };
}

export function deletionReminderEmail(
  daysLeft: number,
  scheduledForDate: string,
  language: Language,
): MailContent {
  const copy = accountEmailCopy(language).deletionReminder;
  const visit = emailStrings(language).orderShipped.siteLinkLabel;
  const intro = copy.intro(daysLeft, formatEmailDay(scheduledForDate, language));
  return {
    subject: copy.title,
    text: `${copy.title}\n\n${intro}\n\n${copy.outro}\n\n${visit} :\n${config.frontendBaseUrl}`,
    html: genericNoticeHtml({
      language,
      title: copy.title,
      paragraphs: [intro, copy.outro],
      ctaUrl: config.frontendBaseUrl,
      ctaLabel: visit,
    }),
  };
}

/** The reduced "your invoice is attached" notice sent by the "Télécharger
 * ma facture" flow (see invoices.service.ts) — deliberately not the full
 * itemized recap orderConfirmationEmail/orderShippedEmail send: the
 * generated PDF is the actual invoice document, this is its branded delivery
 * wrapper. The wrapper speaks the customer's language; the PDF stays French
 * (a French invoice), which the wrapper says outside French. Reused verbatim
 * for a resend, since the PDF is idempotent/reused either way. */
export function invoiceEmail(
  orderNumber: string,
  language: Language,
  guestOrderReceived = false,
  manageOrderUrl?: string,
): MailContent {
  const copy = accountEmailCopy(language).invoice;
  const manageLabel = emailStrings(language).orderConfirmation.guestAccountLinkLabel;
  const title = copy.title(orderNumber);
  const intro = guestOrderReceived ? copy.guestIntro(orderNumber, manageLabel) : copy.intro(orderNumber);
  const paragraphs = [intro, copy.frenchDocumentNote].filter((line): line is string => Boolean(line));
  const ctaUrl = guestOrderReceived
    ? (manageOrderUrl ?? `${config.frontendBaseUrl}/account/manage-order`)
    : config.frontendBaseUrl;
  const ctaLabel = guestOrderReceived ? manageLabel : emailStrings(language).orderShipped.siteLinkLabel;
  return {
    subject: `${title} : Shop`,
    text: `${title}\n\n${paragraphs.join('\n\n')}\n\n${ctaLabel} :\n${ctaUrl}`,
    html: genericNoticeHtml({ language, title, paragraphs, ctaUrl, ctaLabel }),
  };
}

/** Account holders receive this once carrier tracking confirms receipt. The
 * invoice remains available from their authenticated order history. */
export function orderReceivedEmail(orderNumber: string, language: Language): MailContent {
  const copy = accountEmailCopy(language).orderReceived;
  const historyUrl = `${config.frontendBaseUrl}/orders/history`;
  const title = copy.title(orderNumber);
  return {
    subject: copy.subject(orderNumber),
    text: `${title}\n\n${copy.intro}\n\n${copy.cta} :\n${historyUrl}`,
    html: genericNoticeHtml({
      language,
      title,
      paragraphs: [copy.intro],
      ctaUrl: historyUrl,
      ctaLabel: copy.cta,
    }),
  };
}

export function productRequestResponseEmail(data: {
  publicId: string;
  token: string;
  title: string;
  size: string;
  quantity: number;
  price: number;
  message: string;
  accepted: boolean;
  language: Language;
}): MailContent {
  const copy = accountEmailCopy(data.language).productRequest;
  const marker = `TUCHO-REQUEST:${data.publicId}:${data.token}:${appVersion}:${config.target}`;
  const text = `${data.accepted ? copy.accepted : copy.refused}\n\n${copy.article} : ${data.title}\n${copy.size} : ${data.size}\n${copy.quantity} : ${data.quantity}\n${copy.price} : ${data.price.toFixed(2)} €\n\n${data.message}\n\n${copy.replyHint}\n\n${marker}`;
  return {
    subject: data.accepted ? copy.acceptedSubject : copy.refusedSubject,
    text,
    html: genericNoticeHtml({
      language: data.language,
      title: copy.title,
      paragraphs: text.split('\n').filter(Boolean),
    }),
    headers: {
      'X-Tuucho-Product-Request': data.publicId,
      'X-Tuucho-Product-Token': data.token,
      'X-Tuucho-Chat-Version': appVersion,
      'X-Tuucho-Chat-Target': config.target,
    },
    kind: 'user',
  };
}

/** "A super-admin session just started" notice with a lock link: on every
 * sign-in (`signin`) and on an automatic session resume after an idle period
 * (`resume`). Lists what the request revealed (time, place, IP, device). */
export function superAdminSignInEmail(input: {
  kind: 'signin' | 'resume';
  at: Date;
  ip: string | null;
  location: string | null;
  device: string | null;
  lockUrl: string;
  language: Language;
}): MailContent {
  const copy = accountEmailCopy(input.language).superAdminSignIn;
  const intro = input.kind === 'signin' ? copy.introSignIn : copy.introResume;
  const details = [
    copy.when(formatEmailMoment(input.at, input.language)),
    copy.place(input.location ?? copy.unknown),
    copy.ipAddress(input.ip ?? copy.unknown),
    copy.device(input.device ?? copy.unknown),
  ];
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${intro}\n\n${details.join('\n')}\n\n${copy.outro}\n\n${copy.lockLabel} :\n${input.lockUrl}`,
    html: genericNoticeHtml({
      language: input.language,
      title: copy.title,
      paragraphs: [intro, ...details, copy.outro],
      ctaUrl: input.lockUrl,
      ctaLabel: copy.cta,
    }),
  };
}
