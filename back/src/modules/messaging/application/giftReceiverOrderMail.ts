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

export const GIFT_RECEIVER_ORDER_MAIL: Record<Language, GiftReceiverOrderMail> = {
  fr: {
    confirmation: {
      subject: (orderNumber) => `Confirmation de ton cadeau ${orderNumber} : Lumen`,
      title: 'Ton cadeau est confirmé',
      intro: 'Voici le récapitulatif de ton cadeau.',
      itemsHeading: 'Ton cadeau',
    },
    shipped: {
      subject: (orderNumber) => `Ton cadeau ${orderNumber} est en route : Lumen`,
      title: 'Ton cadeau est en route',
      intro: 'Bonne nouvelle : ton cadeau vient d’être envoyé.',
      itemsHeading: 'Contenu de ton cadeau',
    },
    updated: {
      subject: (orderNumber) => `Mise à jour de ton cadeau ${orderNumber} : Lumen`,
      title: 'L’adresse de ton cadeau a été mise à jour',
      intro: 'L’adresse de livraison de ton cadeau a été modifiée. Voici le récapitulatif à jour.',
      notice: 'Ce récapitulatif remplace l’adresse indiquée dans l’email précédent.',
    },
    cancelled: {
      subject: (orderNumber) => `Ton cadeau ${orderNumber} a été annulé : Lumen`,
      title: 'Ton cadeau a été annulé',
      intro: 'Le cadeau qui t’était destiné a été annulé.',
      body: 'Aucun envoi n’aura lieu.',
    },
    received: {
      subject: (orderNumber) => `Ton cadeau ${orderNumber} est bien arrivé : Lumen`,
      title: 'Ton cadeau est bien arrivé',
      intro: 'La livraison de ton cadeau est indiquée comme reçue.',
    },
  },
  en: {
    confirmation: {
      subject: (orderNumber) => `Your gift ${orderNumber} is confirmed : Lumen`,
      title: 'Your gift is confirmed',
      intro: 'Here is what is in your gift.',
      itemsHeading: 'Your gift',
    },
    shipped: {
      subject: (orderNumber) => `Your gift ${orderNumber} is on its way : Lumen`,
      title: 'Your gift is on its way',
      intro: 'Good news: your gift has just been sent.',
      itemsHeading: 'In your gift',
    },
    updated: {
      subject: (orderNumber) => `Your gift ${orderNumber} has been updated : Lumen`,
      title: 'Your gift delivery address was updated',
      intro: 'The delivery address for your gift was changed. Here is the updated summary.',
      notice: 'This summary replaces the address in the previous email.',
    },
    cancelled: {
      subject: (orderNumber) => `Your gift ${orderNumber} was cancelled : Lumen`,
      title: 'Your gift was cancelled',
      intro: 'The gift meant for you was cancelled.',
      body: 'Nothing will be sent.',
    },
    received: {
      subject: (orderNumber) => `Your gift ${orderNumber} has arrived : Lumen`,
      title: 'Your gift has arrived',
      intro: 'Delivery of your gift is marked as received.',
    },
  },
  es: {
    confirmation: {
      subject: (orderNumber) => `Confirmación de tu regalo ${orderNumber} : Lumen`,
      title: 'Tu regalo está confirmado',
      intro: 'Aquí tienes el resumen de tu regalo.',
      itemsHeading: 'Tu regalo',
    },
    shipped: {
      subject: (orderNumber) => `Tu regalo ${orderNumber} está en camino : Lumen`,
      title: 'Tu regalo está en camino',
      intro: 'Buenas noticias: tu regalo acaba de ser enviado.',
      itemsHeading: 'Tu regalo',
    },
    updated: {
      subject: (orderNumber) => `Actualización de tu regalo ${orderNumber} : Lumen`,
      title: 'La dirección de tu regalo se ha actualizado',
      intro: 'La dirección de entrega de tu regalo ha cambiado. Aquí tienes el resumen actualizado.',
      notice: 'Este resumen sustituye la dirección del email anterior.',
    },
    cancelled: {
      subject: (orderNumber) => `Tu regalo ${orderNumber} ha sido anulado : Lumen`,
      title: 'Tu regalo ha sido anulado',
      intro: 'El regalo destinado a ti ha sido anulado.',
      body: 'No se enviará nada.',
    },
    received: {
      subject: (orderNumber) => `Tu regalo ${orderNumber} ha llegado : Lumen`,
      title: 'Tu regalo ha llegado',
      intro: 'La entrega de tu regalo figura como recibida.',
    },
  },
  it: {
    confirmation: {
      subject: (orderNumber) => `Conferma del tuo regalo ${orderNumber} : Lumen`,
      title: 'Il tuo regalo è confermato',
      intro: 'Ecco il riepilogo del tuo regalo.',
      itemsHeading: 'Il tuo regalo',
    },
    shipped: {
      subject: (orderNumber) => `Il tuo regalo ${orderNumber} è in viaggio : Lumen`,
      title: 'Il tuo regalo è in viaggio',
      intro: 'Buone notizie: il tuo regalo è appena stato spedito.',
      itemsHeading: 'Il tuo regalo',
    },
    updated: {
      subject: (orderNumber) => `Aggiornamento del tuo regalo ${orderNumber} : Lumen`,
      title: 'L’indirizzo del tuo regalo è stato aggiornato',
      intro: 'L’indirizzo di consegna del tuo regalo è stato modificato. Ecco il riepilogo aggiornato.',
      notice: 'Questo riepilogo sostituisce l’indirizzo dell’email precedente.',
    },
    cancelled: {
      subject: (orderNumber) => `Il tuo regalo ${orderNumber} è stato annullato : Lumen`,
      title: 'Il tuo regalo è stato annullato',
      intro: 'Il regalo destinato a te è stato annullato.',
      body: 'Non verrà spedito nulla.',
    },
    received: {
      subject: (orderNumber) => `Il tuo regalo ${orderNumber} è arrivato : Lumen`,
      title: 'Il tuo regalo è arrivato',
      intro: 'La consegna del tuo regalo risulta ricevuta.',
    },
  },
  nl: {
    confirmation: {
      subject: (orderNumber) => `Bevestiging van je cadeau ${orderNumber} : Lumen`,
      title: 'Je cadeau is bevestigd',
      intro: 'Hier is het overzicht van je cadeau.',
      itemsHeading: 'Je cadeau',
    },
    shipped: {
      subject: (orderNumber) => `Je cadeau ${orderNumber} is onderweg : Lumen`,
      title: 'Je cadeau is onderweg',
      intro: 'Goed nieuws: je cadeau is zojuist verzonden.',
      itemsHeading: 'Je cadeau',
    },
    updated: {
      subject: (orderNumber) => `Update van je cadeau ${orderNumber} : Lumen`,
      title: 'Het adres van je cadeau is bijgewerkt',
      intro: 'Het bezorgadres van je cadeau is gewijzigd. Hier is het bijgewerkte overzicht.',
      notice: 'Dit overzicht vervangt het adres uit de vorige e-mail.',
    },
    cancelled: {
      subject: (orderNumber) => `Je cadeau ${orderNumber} is geannuleerd : Lumen`,
      title: 'Je cadeau is geannuleerd',
      intro: 'Het cadeau voor jou is geannuleerd.',
      body: 'Er wordt niets verzonden.',
    },
    received: {
      subject: (orderNumber) => `Je cadeau ${orderNumber} is aangekomen : Lumen`,
      title: 'Je cadeau is aangekomen',
      intro: 'De levering van je cadeau staat als ontvangen.',
    },
  },
  pt: {
    confirmation: {
      subject: (orderNumber) => `Confirmação do teu presente ${orderNumber} : Lumen`,
      title: 'O teu presente está confirmado',
      intro: 'Aqui está o resumo do teu presente.',
      itemsHeading: 'O teu presente',
    },
    shipped: {
      subject: (orderNumber) => `O teu presente ${orderNumber} está a caminho : Lumen`,
      title: 'O teu presente está a caminho',
      intro: 'Boas notícias: o teu presente acabou de ser enviado.',
      itemsHeading: 'O teu presente',
    },
    updated: {
      subject: (orderNumber) => `Atualização do teu presente ${orderNumber} : Lumen`,
      title: 'A morada do teu presente foi atualizada',
      intro: 'A morada de entrega do teu presente foi alterada. Aqui está o resumo atualizado.',
      notice: 'Este resumo substitui a morada do email anterior.',
    },
    cancelled: {
      subject: (orderNumber) => `O teu presente ${orderNumber} foi anulado : Lumen`,
      title: 'O teu presente foi anulado',
      intro: 'O presente destinado a ti foi anulado.',
      body: 'Nada será enviado.',
    },
    received: {
      subject: (orderNumber) => `O teu presente ${orderNumber} chegou : Lumen`,
      title: 'O teu presente chegou',
      intro: 'A entrega do teu presente está marcada como recebida.',
    },
  },
  th: {
    confirmation: {
      subject: (orderNumber) => `ยืนยันของขวัญ ${orderNumber} : Lumen`,
      title: 'ของขวัญของคุณได้รับการยืนยันแล้ว',
      intro: 'นี่คือรายการของขวัญของคุณ',
      itemsHeading: 'ของขวัญของคุณ',
    },
    shipped: {
      subject: (orderNumber) => `ของขวัญ ${orderNumber} กำลังจัดส่ง : Lumen`,
      title: 'ของขวัญของคุณกำลังเดินทาง',
      intro: 'ข่าวดี: ของขวัญของคุณถูกส่งแล้ว',
      itemsHeading: 'ของขวัญของคุณ',
    },
    updated: {
      subject: (orderNumber) => `อัปเดตของขวัญ ${orderNumber} : Lumen`,
      title: 'ที่อยู่ของของขวัญได้รับการอัปเดต',
      intro: 'ที่อยู่จัดส่งของของขวัญถูกเปลี่ยนแล้ว นี่คือสรุปล่าสุด',
      notice: 'สรุปนี้ใช้แทนที่อยู่ในอีเมลก่อนหน้า',
    },
    cancelled: {
      subject: (orderNumber) => `ของขวัญ ${orderNumber} ถูกยกเลิก : Lumen`,
      title: 'ของขวัญของคุณถูกยกเลิก',
      intro: 'ของขวัญที่ตั้งใจให้คุณถูกยกเลิกแล้ว',
      body: 'จะไม่มีการจัดส่ง',
    },
    received: {
      subject: (orderNumber) => `ของขวัญ ${orderNumber} ถึงแล้ว : Lumen`,
      title: 'ของขวัญของคุณถึงแล้ว',
      intro: 'การจัดส่งของขวัญถูกระบุว่าได้รับแล้ว',
    },
  },
};

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
  return noticeEmail(language, GIFT_RECEIVER_ORDER_MAIL[language].cancelled, orderNumber);
}

/** Delivery-received notice for the recipient. No invoice or order-history link. */
export function giftReceiverReceivedEmail(
  orderNumber: string,
  language: Language,
): Omit<MailMessage, 'to'> {
  return noticeEmail(language, GIFT_RECEIVER_ORDER_MAIL[language].received, orderNumber);
}
