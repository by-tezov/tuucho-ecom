import { localizedCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '../../../utils/language.js';
import { genericNoticeHtml } from './emailTemplates.js';
import type { MailMessage } from './emailDispatch.js';

/** Progress mail for the person receiving the gift. The payer's copy stays a
 * normal priced order. This copy never mentions prices or the integrity code. */
export interface GiftReceiverOrderMail {
  confirmation: {
    subject: (orderNumber: string) => string;
    title: string;
    intro: string;
    itemsHeading: string;
  };
  shipped: {
    subject: (orderNumber: string) => string;
    title: string;
    intro: string;
    itemsHeading: string;
  };
  updated: {
    subject: (orderNumber: string) => string;
    title: string;
    intro: string;
    notice: string;
  };
  cancelled: {
    subject: (orderNumber: string) => string;
    title: string;
    intro: string;
    body: string;
  };
  received: {
    subject: (orderNumber: string) => string;
    title: string;
    intro: string;
  };
}

export function giftReceiverOrderMail(language: Language): GiftReceiverOrderMail {
  return localizedCatalog(language, 'gift-receiver');
}

function noticeEmail(
  language: Language,
  copy: { subject: (orderNumber: string) => string; title: string; intro: string; body?: string },
  orderNumber: string,
): Omit<MailMessage, 'to'> {
  const paragraphs = [copy.intro, orderNumber, copy.body].filter((line): line is string => Boolean(line));
  return {
    subject: copy.subject(orderNumber),
    text: `${copy.title}\n\n${paragraphs.join('\n\n')}`,
    html: genericNoticeHtml({ language, title: copy.title, paragraphs }),
  };
}

/** Cancellation notice for the recipient. No payment wording and no account link. */
export function giftReceiverCancelledEmail(
  orderNumber: string,
  language: Language,
): Omit<MailMessage, 'to'> {
  return noticeEmail(language, giftReceiverOrderMail(language).cancelled, orderNumber);
}

/** Delivery-received notice for the recipient. No invoice or order-history link. */
export function giftReceiverReceivedEmail(
  orderNumber: string,
  language: Language,
): Omit<MailMessage, 'to'> {
  return noticeEmail(language, giftReceiverOrderMail(language).received, orderNumber);
}
