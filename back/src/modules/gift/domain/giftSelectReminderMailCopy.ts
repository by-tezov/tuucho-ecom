import type { Language } from '../../../utils/language.js';

/** Giver mail sent `GIFT_SELECT_REMINDER_BEFORE` ahead of `offer_expires_at`
 * while the receiver has still not confirmed a choice. The receiver's email
 * is never stored, so the giver is the one who can nudge them. */
export interface GiftSelectReminderMailCopy {
  subject: (receiverName: string) => string;
  title: (receiverName: string) => string;
  notChosen: (receiverName: string) => string;
  activeUntil: (date: string) => string;
  extend: (extendDays: number) => string;
  ctaLabel: string;
  ctaFallbackHint: string;
}

export const GIFT_SELECT_REMINDER_MAIL: Record<Language, GiftSelectReminderMailCopy> = {
  fr: {
    subject: (n) => `${n} n’a pas encore choisi son cadeau`,
    title: (n) => `${n} n’a pas encore choisi son cadeau`,
    notChosen: (n) => `${n} n’a pas encore validé de choix. Tu peux lui renvoyer le lien depuis ton espace cadeau.`,
    activeUntil: (date) => `L’offre cadeau expire le ${date}.`,
    extend: (days) => `Besoin de plus de temps ? Depuis ton espace cadeau, tu peux prolonger l’offre de ${days} jours.`,
    ctaLabel: 'Ton espace cadeau',
    ctaFallbackHint: 'Si le bouton ne fonctionne pas, tu peux utiliser ce lien :',
  },
  en: {
    subject: (n) => `${n} has not chosen their gift yet`,
    title: (n) => `${n} has not chosen their gift yet`,
    notChosen: (n) => `${n} has not confirmed a choice yet. You can send them the link again from your gift space.`,
    activeUntil: (date) => `The gift offer expires on ${date}.`,
    extend: (days) => `Need more time? From your gift space, you can extend the offer by ${days} days.`,
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  },
  es: {
    subject: (n) => `${n} aún no ha elegido su regalo`,
    title: (n) => `${n} aún no ha elegido su regalo`,
    notChosen: (n) =>
      `${n} aún no ha confirmado ninguna elección. Puedes volver a enviarle el enlace desde tu espacio regalo.`,
    activeUntil: (date) => `La oferta de regalo caduca el ${date}.`,
    extend: (days) => `¿Necesitas más tiempo? Desde tu espacio regalo puedes prolongar la oferta ${days} días.`,
    ctaLabel: 'Tu espacio regalo',
    ctaFallbackHint: 'Si el botón no funciona, puedes usar este enlace:',
  },
  it: {
    subject: (n) => `${n} non ha ancora scelto il suo regalo`,
    title: (n) => `${n} non ha ancora scelto il suo regalo`,
    notChosen: (n) =>
      `${n} non ha ancora confermato una scelta. Puoi inviargli di nuovo il link dal tuo spazio regalo.`,
    activeUntil: (date) => `L’offerta regalo scade il ${date}.`,
    extend: (days) => `Serve più tempo? Dal tuo spazio regalo puoi prolungare l’offerta di ${days} giorni.`,
    ctaLabel: 'Il tuo spazio regalo',
    ctaFallbackHint: 'Se il pulsante non funziona, puoi usare questo link:',
  },
  nl: {
    subject: (n) => `${n} heeft nog geen cadeau gekozen`,
    title: (n) => `${n} heeft nog geen cadeau gekozen`,
    notChosen: (n) => `${n} heeft nog geen keuze bevestigd. Je kunt de link opnieuw sturen vanuit je cadeauruimte.`,
    activeUntil: (date) => `Het cadeau-aanbod verloopt op ${date}.`,
    extend: (days) => `Meer tijd nodig? Vanuit je cadeauruimte kun je het aanbod met ${days} dagen verlengen.`,
    ctaLabel: 'Jouw cadeauruimte',
    ctaFallbackHint: 'Werkt de knop niet, dan kun je deze link gebruiken:',
  },
  pt: {
    subject: (n) => `${n} ainda não escolheu o presente`,
    title: (n) => `${n} ainda não escolheu o presente`,
    notChosen: (n) =>
      `${n} ainda não confirmou nenhuma escolha. Podes voltar a enviar-lhe o link a partir do teu espaço presente.`,
    activeUntil: (date) => `A oferta presente expira a ${date}.`,
    extend: (days) => `Precisas de mais tempo? No teu espaço presente podes prolongar a oferta por ${days} dias.`,
    ctaLabel: 'O teu espaço presente',
    ctaFallbackHint: 'Se o botão não funcionar, podes usar este link:',
  },
  th: {
    subject: (n) => `${n} ยังไม่ได้เลือกของขวัญ`,
    title: (n) => `${n} ยังไม่ได้เลือกของขวัญ`,
    notChosen: (n) => `${n} ยังไม่ได้ยืนยันการเลือก คุณสามารถส่งลิงก์ให้อีกครั้งได้จากพื้นที่ของขวัญของคุณ`,
    activeUntil: (date) => `ข้อเสนอของขวัญจะหมดอายุวันที่ ${date}`,
    extend: (days) => `ต้องการเวลาเพิ่มไหม? คุณสามารถขยายข้อเสนอออกไปอีก ${days} วันได้จากพื้นที่ของขวัญของคุณ`,
    ctaLabel: 'พื้นที่ของขวัญของคุณ',
    ctaFallbackHint: 'ถ้าปุ่มใช้ไม่ได้ คุณสามารถใช้ลิงก์นี้:',
  },
};
