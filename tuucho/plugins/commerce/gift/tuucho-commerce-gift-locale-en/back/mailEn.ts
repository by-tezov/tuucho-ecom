import type { GiftNoticeMailCopy } from '../../tuucho-commerce-gift/back/src/domain/giftNoticeMailCopy.js';
import type { GiftSelectReminderMailCopy } from '../../tuucho-commerce-gift/back/src/domain/giftSelectReminderMailCopy.js';
import type { GiftShareCardMailCopy } from '../../tuucho-commerce-gift/back/src/domain/giftShareCardMailCopy.js';
import type { GiverPromiseMailCopy } from '../../tuucho-commerce-gift/back/src/domain/giverPromiseMailCopy.js';

export const enGiftShareCard: GiftShareCardMailCopy = {
    subject: (receiverName) => `Gift card for ${receiverName}`,
    title: 'Your gift card is ready',
    intro: (giverDisplayName) => `Hi ${giverDisplayName},`,
    filesParagraph:
      'Two files are attached to this email: a PDF and a JPG. The PDF places your 5 x 3 inch card on an A4 page. Print it and cut along the dotted line. The JPG is the card alone, same size, ready to send as is.',
    codeParagraph:
      'Also give the 4-digit code chosen at creation. Without this code, the gift cannot be opened. The code also lets you access the gift space to complete payment. Do not forget this code, without it you cannot finalize your gift.',
    securityParagraph:
      'For extra security, do not share the code through the same channel as the card or the link: for example, print the card and send the code by text message.',
    trackParagraph: 'To track the gift or pay later, open your gift space.',
    activeUntil: (date) => `The gift offer stays active until ${date}.`,
    activeUntilDefault: 'The gift offer stays active for the duration set in the shop.',
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  };

export const enGiftNotice: GiftNoticeMailCopy = {
    cancelledTitle: 'Unpaid gift',
    cancelledBody: (receiver) => `The gift for ${receiver} has been cancelled. No order was created.`,
    someone: 'the recipient',
    holdTitle: 'Stock will soon no longer be guaranteed',
    payTitle: 'Last days to pay',
    reminderBody: 'Open the gift link to pay. Nothing is charged automatically.',
    reminderCta: 'Pay for the gift',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  };

export const enGiftSelectReminder: GiftSelectReminderMailCopy = {
    subject: (n) => `${n} has not chosen their gift yet`,
    title: (n) => `${n} has not chosen their gift yet`,
    notChosen: (n) => `${n} has not confirmed a choice yet. You can send them the link again from your gift space.`,
    activeUntil: (date) => `The gift offer expires on ${date}.`,
    extend: (days) => `Need more time? From your gift space, you can extend the offer by ${days} days.`,
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  };

export const enGiverPromise: GiverPromiseMailCopy = {
    subject: (receiverName) => `${receiverName} confirmed their choice`,
    title: (receiverName) => `${receiverName} confirmed their choice`,
    body: 'Open your gift space to check the order and pay.',
    activeUntil: (date) => `The gift offer stays active until ${date}.`,
    stockReservedUntil: (n, date) =>
      `The stock ${n} chose is reserved for you until ${date}. After that, the stock will be released.`,
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  };

export const enGiftShareCardPdf = {
  title: 'Shop gift card',
  printHint:
    'Print this page, cut out the 5 x 3 inch card along the dotted line, and give it. The 4-digit code is not on this sheet: give it separately.',
  footer: 'Shop',
  useBefore: 'Use before',
  faceAlt: 'Shop gift card from {giver} to {receiver}, with a QR code that opens the gift page.',
  messageLabel: 'Message:',
};
