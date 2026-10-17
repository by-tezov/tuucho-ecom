import { config } from '../../../../config/env.js';
import type { MailMessage } from '../../../messaging/application/email.js';
import { renderEmailTemplate } from '../../../messaging/application/emailTemplates.js';
import type { Language } from '../../../../utils/language.js';

interface ReturnEmailStrings {
  subject: (orderNumber: string) => string;
  title: string;
  intro: string;
  refundLabel: string;
  courierRetainedLabel: string;
  loginLinkLabel: string;
  footer: string;
}

const STRINGS: Record<Language, ReturnEmailStrings> = {
  fr: {
    subject: (number) => `Décision concernant votre commande ${number} : Shop`,
    title: 'Votre commande retournée a été traitée',
    intro: 'Après vérification manuelle du colis, votre commande a été annulée.',
    refundLabel: 'Montant remboursé',
    courierRetainedLabel: 'Frais de livraison retenus',
    loginLinkLabel: 'Voir mes commandes',
    footer: 'Cet email est envoyé automatiquement par Shop, merci de ne pas y répondre.',
  },
  en: {
    subject: (number) => `Decision for your order ${number} : Shop`,
    title: 'Your returned order has been processed',
    intro: 'Following a manual parcel review, your order has been cancelled.',
    refundLabel: 'Amount refunded',
    courierRetainedLabel: 'Shipping retained',
    loginLinkLabel: 'View my orders',
    footer: 'This email was sent automatically by Shop. Please do not reply.',
  },
};

export function orderReturnResolvedEmail(
  orderNumber: string,
  refundAmountCents: number,
  courierRetainedCents: number,
  language: Language,
  manageOrderUrl?: string,
): Omit<MailMessage, 'to'> {
  const strings = STRINGS[language];
  const money = (value: number) => `${(value / 100).toFixed(2)} €`;
  const outcome = [
    `${strings.refundLabel} : ${money(refundAmountCents)}`,
    `${strings.courierRetainedLabel} : ${money(courierRetainedCents)}`,
  ];
  const ordersUrl = manageOrderUrl ?? `${config.frontendBaseUrl}/orders/history`;
  return {
    subject: strings.subject(orderNumber),
    text: `${strings.title}\n\n${strings.intro}\n\n${orderNumber}\n\n${outcome.join('\n')}\n\n${ordersUrl}`,
    html: renderEmailTemplate('genericNotice', language, {
      title: strings.title,
      paragraphs: [strings.intro, orderNumber, ...outcome],
      ctaUrl: ordersUrl,
      ctaLabel: strings.loginLinkLabel,
      footer: strings.footer,
    }),
  };
}
