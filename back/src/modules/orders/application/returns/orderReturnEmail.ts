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
    subject: (number) => `Décision concernant votre commande ${number} : Lumen`,
    title: 'Votre commande retournée a été traitée',
    intro: 'Après vérification manuelle du colis, votre commande a été annulée.',
    refundLabel: 'Montant remboursé',
    courierRetainedLabel: 'Frais de livraison retenus',
    loginLinkLabel: 'Voir mes commandes',
    footer: 'Cet email est envoyé automatiquement par Lumen, merci de ne pas y répondre.',
  },
  en: {
    subject: (number) => `Decision for your order ${number} : Lumen`,
    title: 'Your returned order has been processed',
    intro: 'Following a manual parcel review, your order has been cancelled.',
    refundLabel: 'Amount refunded',
    courierRetainedLabel: 'Shipping retained',
    loginLinkLabel: 'View my orders',
    footer: 'This email was sent automatically by Lumen. Please do not reply.',
  },
  es: {
    subject: (number) => `Decisión sobre tu pedido ${number} : Lumen`,
    title: 'Tu pedido devuelto ha sido procesado',
    intro: 'Tras una revisión manual del paquete, tu pedido ha sido cancelado.',
    refundLabel: 'Importe reembolsado',
    courierRetainedLabel: 'Gastos de envío retenidos',
    loginLinkLabel: 'Ver mis pedidos',
    footer: 'Este correo se envía automáticamente por Lumen; no respondas a este mensaje.',
  },
  it: {
    subject: (number) => `Decisione sul tuo ordine ${number} : Lumen`,
    title: 'Il tuo ordine restituito è stato elaborato',
    intro: 'Dopo una verifica manuale del pacco, il tuo ordine è stato annullato.',
    refundLabel: 'Importo rimborsato',
    courierRetainedLabel: 'Spese di spedizione trattenute',
    loginLinkLabel: 'Vedi i miei ordini',
    footer: 'Questa email è inviata automaticamente da Lumen; non rispondere.',
  },
  nl: {
    subject: (number) => `Beslissing over je bestelling ${number} : Lumen`,
    title: 'Je geretourneerde bestelling is verwerkt',
    intro: 'Na een handmatige controle van het pakket is je bestelling geannuleerd.',
    refundLabel: 'Terugbetaald bedrag',
    courierRetainedLabel: 'Ingehouden verzendkosten',
    loginLinkLabel: 'Bekijk mijn bestellingen',
    footer: 'Deze e-mail is automatisch verzonden door Lumen; gelieve niet te antwoorden.',
  },
  pt: {
    subject: (number) => `Decisão sobre a sua encomenda ${number} : Lumen`,
    title: 'A sua encomenda devolvida foi processada',
    intro: 'Após uma verificação manual do pacote, a sua encomenda foi cancelada.',
    refundLabel: 'Montante reembolsado',
    courierRetainedLabel: 'Portes retidos',
    loginLinkLabel: 'Ver as minhas encomendas',
    footer: 'Este é um email automático da Lumen; não responda a esta mensagem.',
  },
  th: {
    subject: (number) => `ผลการตรวจสอบคำสั่งซื้อ ${number} : Lumen`,
    title: 'ดำเนินการคำสั่งซื้อที่ส่งคืนแล้ว',
    intro: 'หลังจากตรวจสอบพัสดุโดยเจ้าหน้าที่ คำสั่งซื้อของคุณถูกยกเลิกแล้ว',
    refundLabel: 'จำนวนเงินที่คืน',
    courierRetainedLabel: 'ค่าจัดส่งที่หักไว้',
    loginLinkLabel: 'ดูคำสั่งซื้อของฉัน',
    footer: 'นี่คือข้อความอัตโนมัติจาก Lumen กรุณาอย่าตอบกลับอีเมลนี้',
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
