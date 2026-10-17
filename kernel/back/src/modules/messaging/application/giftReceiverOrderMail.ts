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

export const GIFT_RECEIVER_ORDER_MAIL: { en: GiftReceiverOrderMail } = {
  en: {
    confirmation: {
      subject: (orderNumber) => `Your gift ${orderNumber} is confirmed : Shop`,
      title: 'Your gift is confirmed',
      intro: 'Here is what is in your gift.',
      itemsHeading: 'Your gift',
    },
    shipped: {
      subject: (orderNumber) => `Your gift ${orderNumber} is on its way : Shop`,
      title: 'Your gift is on its way',
      intro: 'Good news: your gift has just been sent.',
      itemsHeading: 'In your gift',
    },
    updated: {
      subject: (orderNumber) => `Your gift ${orderNumber} has been updated : Shop`,
      title: 'Your gift delivery address was updated',
      intro: 'The delivery address for your gift was changed. Here is the updated summary.',
      notice: 'This summary replaces the address in the previous email.',
    },
    cancelled: {
      subject: (orderNumber) => `Your gift ${orderNumber} was cancelled : Shop`,
      title: 'Your gift was cancelled',
      intro: 'The gift meant for you was cancelled.',
      body: 'Nothing will be sent.',
    },
    received: {
      subject: (orderNumber) => `Your gift ${orderNumber} has arrived : Shop`,
      title: 'Your gift has arrived',
      intro: 'Delivery of your gift is marked as received.',
    },
  },
};

export function giftReceiverOrderMail(language: Language): GiftReceiverOrderMail {
  return localizedCatalog(GIFT_RECEIVER_ORDER_MAIL.en, language, 'gift-receiver');
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
