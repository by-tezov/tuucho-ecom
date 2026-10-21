import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendMail, spyTo, type MailMessage } from '@kernel/back/modules/messaging/application/email';
import { automaticEmailFooter, renderEmailTemplate } from '@kernel/back/modules/messaging/application/emailTemplates';
import type { Language } from '@kernel/back/utils/language';
import { GIVER_PROMISE_MAIL_DATE_LOCALES, giverPromiseMail } from '../domain/giverPromiseMailCopy.js';
import { giftShareCardMail } from '../domain/giftShareCardMailCopy.js';
import { giftSelectReminderMail } from '../domain/giftSelectReminderMailCopy.js';
import { giftNoticeMail } from '../domain/giftNoticeMailCopy.js';
import type { GiftShareCardStyle } from '../domain/shareCardStyle.js';
import { writeGiftShareCardPdf } from './giftShareCardPdf.js';
import { writeGiftShareCardJpeg } from './giftShareCardJpeg.js';
import { giftGiverUrl, giftReceiverUrl } from './giftUrls.js';

/** A gift mail in the giver's language, footer and link hint included. */
function html(language: Language, context: { ctaFallbackHint?: string } & Record<string, unknown>): string {
  return renderEmailTemplate('giftNotice', language, {
    ...context,
    footer: automaticEmailFooter(language),
    ctaFallbackHint: context.ctaFallbackHint ?? giftNoticeMail(language).ctaFallbackHint,
  });
}

function formatValidUntil(date: Date | null | undefined, language: Language = 'fr'): string | null {
  if (!date) return null;
  return date.toLocaleDateString(GIVER_PROMISE_MAIL_DATE_LOCALES[language], { dateStyle: 'long' });
}

function giftOfferActiveUntil(validUntil: Date | null | undefined, language: Language): string {
  const copy = giftShareCardMail(language);
  const until = formatValidUntil(validUntil, language);
  return until ? copy.activeUntil(until) : copy.activeUntilDefault;
}

export function giverShareCardEmail(input: {
  giverDisplayName: string;
  receiverName: string;
  giverToken: string;
  language: Language;
  validUntil?: Date | null;
}): Omit<MailMessage, 'to'> {
  const giverUrl = giftGiverUrl(input.giverToken, input.language);
  const copy = giftShareCardMail(input.language);
  const validity = giftOfferActiveUntil(input.validUntil, input.language);
  return {
    subject: copy.subject(input.receiverName),
    text: `${copy.intro(input.giverDisplayName)}\n\n${copy.filesParagraph}\n\n${copy.codeParagraph}\n\n${copy.securityParagraph}\n\n${copy.trackParagraph}\n\n${validity}\n\n${copy.ctaLabel} :\n${copy.ctaFallbackHint}\n${giverUrl}`,
    html: html(input.language, {
      title: copy.title,
      paragraphs: [
        copy.intro(input.giverDisplayName),
        copy.filesParagraph,
        copy.codeParagraph,
        copy.securityParagraph,
        copy.trackParagraph,
        validity,
      ],
      ctaUrl: giverUrl,
      ctaLabel: copy.ctaLabel,
      ctaFallbackHint: copy.ctaFallbackHint,
    }),
  };
}

export async function sendGiverShareCardMail(input: {
  to: string;
  giverDisplayName: string;
  giverComment: string;
  receiverName: string;
  receiverToken: string;
  giverToken: string;
  language: Language;
  shareCardStyle: GiftShareCardStyle;
  validUntil?: Date | null;
}): Promise<void> {
  const receiverUrl = giftReceiverUrl(input.receiverToken, input.language);
  const tmpDir = mkdtempSync(join(tmpdir(), 'tuucho-gift-share-'));
  const pdfPath = join(tmpDir, 'carte-cadeau.pdf');
  const jpegPath = join(tmpDir, 'carte-cadeau.jpg');
  const cardInput = {
    receiverUrl,
    giverDisplayName: input.giverDisplayName,
    receiverName: input.receiverName,
    giverComment: input.giverComment,
    style: input.shareCardStyle,
    language: input.language,
    expiresAt: input.validUntil ?? new Date(),
  };
  try {
    await writeGiftShareCardPdf(pdfPath, cardInput);
    await writeGiftShareCardJpeg(jpegPath, cardInput);
    await sendMail({
      to: input.to,
      ...giverShareCardEmail(input),
      attachments: [
        {
          filename: 'carte-cadeau.pdf',
          path: pdfPath,
          contentType: 'application/pdf',
        },
        {
          filename: 'carte-cadeau.jpg',
          path: jpegPath,
          contentType: 'image/jpeg',
        },
      ],
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function giftCancelledEmail(input: {
  receiverName?: string;
  language: Language;
}): Omit<MailMessage, 'to'> {
  const copy = giftNoticeMail(input.language);
  const paragraph = copy.cancelledBody(input.receiverName ?? copy.someone);
  return {
    subject: copy.cancelledTitle,
    text: paragraph,
    html: html(input.language, {
      title: copy.cancelledTitle,
      paragraphs: [paragraph],
    }),
  };
}

export async function sendGiftCancelledMail(input: {
  to: string;
  receiverName?: string;
  language: Language;
}): Promise<void> {
  await sendMail({ to: input.to, ...giftCancelledEmail(input) });
}

export function giverPromiseEmail(input: {
  giverToken: string;
  language: Language;
  receiverName: string;
  holdExpiresAt?: Date | null;
  validUntil?: Date | null;
}): Omit<MailMessage, 'to'> {
  const url = giftGiverUrl(input.giverToken, input.language);
  const copy = giverPromiseMail(input.language);
  const holdUntil = formatValidUntil(input.holdExpiresAt, input.language);
  const payUntil = formatValidUntil(input.validUntil, input.language);
  const stockHold = holdUntil ? copy.stockReservedUntil(input.receiverName, holdUntil) : '';
  const validity = payUntil ? copy.activeUntil(payUntil) : '';
  const title = copy.title(input.receiverName);
  return {
    subject: copy.subject(input.receiverName),
    text: `${title}\n\n${copy.body}\n\n${validity}\n\n${stockHold}\n\n${copy.ctaLabel}\n${copy.ctaFallbackHint}\n${url}`,
    html: html(input.language, {
      title,
      paragraphs: [copy.body, validity, stockHold].filter(Boolean),
      ctaUrl: url,
      ctaLabel: copy.ctaLabel,
      ctaFallbackHint: copy.ctaFallbackHint,
    }),
  };
}

export async function sendGiverPromiseMail(input: {
  to: string;
  giverToken: string;
  language: Language;
  receiverName: string;
  holdExpiresAt?: Date | null;
  validUntil?: Date | null;
}): Promise<void> {
  await sendMail({ to: input.to, ...giverPromiseEmail(input) });
}

export function giftReminderEmail(input: {
  giverToken: string;
  language: Language;
  kind: 'hold' | 'pay';
}): Omit<MailMessage, 'to'> {
  const url = giftGiverUrl(input.giverToken, input.language);
  const copy = giftNoticeMail(input.language);
  const title = input.kind === 'hold' ? copy.holdTitle : copy.payTitle;
  return {
    subject: title,
    text: `${title}\n\n${copy.reminderBody}\n${url}`,
    html: html(input.language, {
      title,
      paragraphs: [copy.reminderBody],
      ctaUrl: url,
      ctaLabel: copy.reminderCta,
    }),
  };
}

export async function sendGiftReminderMail(input: {
  to: string;
  giverToken: string;
  language: Language;
  kind: 'hold' | 'pay';
}): Promise<void> {
  await sendMail({ to: input.to, ...giftReminderEmail(input) });
}

/** `extendDays` is null when "prolonger" is no longer offered (extend ceiling
 * reached), so the mail never promises a button the gift space hides. */
export function giftSelectReminderEmail(input: {
  giverToken: string;
  language: Language;
  receiverName: string;
  validUntil: Date | null;
  extendDays: number | null;
}): Omit<MailMessage, 'to'> {
  const url = giftGiverUrl(input.giverToken, input.language);
  const copy = giftSelectReminderMail(input.language);
  const until = formatValidUntil(input.validUntil, input.language);
  const title = copy.title(input.receiverName);
  const paragraphs = [
    copy.notChosen(input.receiverName),
    until ? copy.activeUntil(until) : '',
    input.extendDays ? copy.extend(input.extendDays) : '',
  ].filter(Boolean);
  return {
    subject: copy.subject(input.receiverName),
    text: `${title}\n\n${paragraphs.join('\n\n')}\n\n${copy.ctaLabel}\n${copy.ctaFallbackHint}\n${url}`,
    html: html(input.language, {
      title,
      paragraphs,
      ctaUrl: url,
      ctaLabel: copy.ctaLabel,
      ctaFallbackHint: copy.ctaFallbackHint,
    }),
  };
}

export async function sendGiftSelectReminderMail(input: {
  to: string;
  giverToken: string;
  language: Language;
  receiverName: string;
  validUntil: Date | null;
  extendDays: number | null;
}): Promise<void> {
  await sendMail({ to: input.to, ...giftSelectReminderEmail(input) });
}

const SPY_FOOTER = 'Copie automatique envoyée au propriétaire du site. Shop.';

function moneyFr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Non renseigné';
  return `${value.toFixed(2)} €`;
}

export interface GiftCreatedSpyData {
  offerId: string;
  giverEmail: string;
  giverDisplayName: string;
  giverUserId: string | null;
  receiverName: string;
  giverComment: string;
  maxBudget: number | null;
  allowAccessories: boolean;
  maxAccessoryBudget: number | null;
  hideReceiverPrices: boolean;
  language: Language;
  offerExpiresAt: Date | null;
  shareCardStyle: GiftShareCardStyle;
  signedIn: boolean;
}

/** Owner copy when a gift offer is created. Always French. Does not include
 * the PIN or live tokens. */
export function giftCreatedSpyEmail(data: GiftCreatedSpyData): Omit<MailMessage, 'to'> {
  const accessories = data.allowAccessories
    ? data.maxAccessoryBudget != null
      ? `Inclus, plafond ${moneyFr(data.maxAccessoryBudget)}`
      : 'Inclus'
    : 'Non inclus';
  const expires = formatValidUntil(data.offerExpiresAt, 'fr') ?? 'Non renseigné';
  const fields = [
    { label: 'Offreur', value: data.giverEmail },
    { label: 'Nom affiché', value: data.giverDisplayName },
    { label: 'Compte', value: data.signedIn ? `Connecté (${data.giverUserId ?? 'id inconnu'})` : 'Invité' },
    { label: 'Destinataire', value: data.receiverName },
    { label: 'Budget', value: moneyFr(data.maxBudget) },
    { label: 'Accessoires', value: accessories },
    { label: 'Prix destinataire', value: data.hideReceiverPrices ? 'Masqués' : 'Visibles' },
    { label: 'Modèle de carte', value: data.shareCardStyle },
    { label: 'Langue', value: data.language },
    { label: 'Expire le', value: expires },
    { label: 'ID offre', value: data.offerId },
  ];
  const comment = data.giverComment;
  if (comment) fields.push({ label: 'Message', value: comment });
  const textLines = [
    'Une offre cadeau a été créée.',
    '',
    ...fields.map((field) => `${field.label} : ${field.value}`),
  ];
  return {
    subject: `Nouveau cadeau : ${data.receiverName}`,
    text: textLines.join('\n'),
    html: renderEmailTemplate('spyNotice', 'fr', {
      title: 'Nouvelle offre cadeau',
      fields,
      footer: SPY_FOOTER,
    }),
    kind: 'spy',
  };
}

export function notifyGiftCreatedSpy(data: GiftCreatedSpyData): void {
  void spyTo('gift_created')
    .then((to) => {
      if (!to) return;
      return sendMail({ to, ...giftCreatedSpyEmail(data) });
    })
    .catch((error) => console.error('[gift] spy notification failed', error));
}
