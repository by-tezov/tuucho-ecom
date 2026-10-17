import type { Language } from '../../../utils/language.js';

/** The giver's short notices: the unpaid gift was cancelled, the payment
 * window is closing. Same informal register as the
 * other gift mails. */
export interface GiftNoticeMailCopy {
  cancelledTitle: string;
  cancelledBody: (receiver: string) => string;
  /** Stands in for the receiver's name when it is unknown. */
  someone: string;
  holdTitle: string;
  payTitle: string;
  reminderBody: string;
  reminderCta: string;
  ctaFallbackHint: string;
}

export const GIFT_NOTICE_MAIL: Record<Language, GiftNoticeMailCopy> = {
  fr: {
    cancelledTitle: 'Cadeau non payé',
    cancelledBody: (receiver) => `Le cadeau pour ${receiver} a été annulé. Aucune commande n’a été créée.`,
    someone: 'le destinataire',
    holdTitle: 'Le stock n’est plus garanti bientôt',
    payTitle: 'Derniers jours pour payer',
    reminderBody: 'Ouvre le lien du cadeau pour payer. Aucun prélèvement automatique.',
    reminderCta: 'Payer le cadeau',
    ctaFallbackHint: 'Si le bouton ne fonctionne pas, tu peux utiliser ce lien :',
  },
  en: {
    cancelledTitle: 'Unpaid gift',
    cancelledBody: (receiver) => `The gift for ${receiver} has been cancelled. No order was created.`,
    someone: 'the recipient',
    holdTitle: 'Stock will soon no longer be guaranteed',
    payTitle: 'Last days to pay',
    reminderBody: 'Open the gift link to pay. Nothing is charged automatically.',
    reminderCta: 'Pay for the gift',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  },
  es: {
    cancelledTitle: 'Regalo no pagado',
    cancelledBody: (receiver) => `El regalo para ${receiver} se ha cancelado. No se ha creado ningún pedido.`,
    someone: 'el destinatario',
    holdTitle: 'El stock pronto dejará de estar garantizado',
    payTitle: 'Últimos días para pagar',
    reminderBody: 'Abre el enlace del regalo para pagar. No se cobra nada automáticamente.',
    reminderCta: 'Pagar el regalo',
    ctaFallbackHint: 'Si el botón no funciona, puedes usar este enlace:',
  },
  it: {
    cancelledTitle: 'Regalo non pagato',
    cancelledBody: (receiver) => `Il regalo per ${receiver} è stato annullato. Nessun ordine è stato creato.`,
    someone: 'il destinatario',
    holdTitle: 'Lo stock presto non sarà più garantito',
    payTitle: 'Ultimi giorni per pagare',
    reminderBody: 'Apri il link del regalo per pagare. Nessun addebito automatico.',
    reminderCta: 'Paga il regalo',
    ctaFallbackHint: 'Se il pulsante non funziona, puoi usare questo link:',
  },
  nl: {
    cancelledTitle: 'Cadeau niet betaald',
    cancelledBody: (receiver) =>
      `Het cadeau voor ${receiver} is geannuleerd. Er is geen bestelling aangemaakt.`,
    someone: 'de ontvanger',
    holdTitle: 'De voorraad is binnenkort niet meer gegarandeerd',
    payTitle: 'Laatste dagen om te betalen',
    reminderBody: 'Open de cadeaulink om te betalen. Er wordt niets automatisch afgeschreven.',
    reminderCta: 'Het cadeau betalen',
    ctaFallbackHint: 'Werkt de knop niet? Gebruik dan deze link:',
  },
  pt: {
    cancelledTitle: 'Presente não pago',
    cancelledBody: (receiver) => `O presente para ${receiver} foi cancelado. Nenhuma encomenda foi criada.`,
    someone: 'o destinatário',
    holdTitle: 'O stock deixará em breve de estar garantido',
    payTitle: 'Últimos dias para pagar',
    reminderBody: 'Abre o link do presente para pagar. Nada é cobrado automaticamente.',
    reminderCta: 'Pagar o presente',
    ctaFallbackHint: 'Se o botão não funcionar, podes usar este link:',
  },
  th: {
    cancelledTitle: 'ของขวัญที่ยังไม่ได้ชำระเงิน',
    cancelledBody: (receiver) => `ของขวัญสำหรับ ${receiver} ถูกยกเลิกแล้ว ไม่มีการสร้างคำสั่งซื้อ`,
    someone: 'ผู้รับ',
    holdTitle: 'สต็อกจะไม่ได้รับการรับประกันในไม่ช้า',
    payTitle: 'วันสุดท้ายสำหรับการชำระเงิน',
    reminderBody: 'เปิดลิงก์ของขวัญเพื่อชำระเงิน ไม่มีการตัดเงินอัตโนมัติ',
    reminderCta: 'ชำระเงินค่าของขวัญ',
    ctaFallbackHint: 'หากปุ่มใช้งานไม่ได้ คุณสามารถใช้ลิงก์นี้:',
  },
};
