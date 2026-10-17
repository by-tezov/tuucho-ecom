import type { Language } from '../../../utils/language.js';

export interface GiverPromiseMailCopy {
  subject: (receiverName: string) => string;
  title: (receiverName: string) => string;
  body: string;
  activeUntil: (date: string) => string;
  stockReservedUntil: (receiverName: string, date: string) => string;
  ctaLabel: string;
  ctaFallbackHint: string;
}

export const GIVER_PROMISE_MAIL_DATE_LOCALES: Record<Language, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  th: 'th-TH',
  es: 'es-ES',
  it: 'it-IT',
  nl: 'nl-NL',
  pt: 'pt-PT',
};

export const GIVER_PROMISE_MAIL: Record<Language, GiverPromiseMailCopy> = {
  fr: {
    subject: (receiverName) => `${receiverName} a confirmé son choix`,
    title: (receiverName) => `${receiverName} a confirmé son choix`,
    body: 'Ouvre ton espace cadeau pour vérifier la commande et procéder au paiement.',
    activeUntil: (date) => `L’offre cadeau reste active jusqu’au ${date}.`,
    stockReservedUntil: (n, date) =>
      `Le stock choisi par ${n} t’est réservé jusqu’au ${date}. Après ce délai, le stock sera libéré.`,
    ctaLabel: 'Ton espace cadeau',
    ctaFallbackHint: 'Si le bouton ne fonctionne pas, tu peux utiliser ce lien :',
  },
  en: {
    subject: (receiverName) => `${receiverName} confirmed their choice`,
    title: (receiverName) => `${receiverName} confirmed their choice`,
    body: 'Open your gift space to check the order and pay.',
    activeUntil: (date) => `The gift offer stays active until ${date}.`,
    stockReservedUntil: (n, date) =>
      `The stock ${n} chose is reserved for you until ${date}. After that, the stock will be released.`,
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  },
  es: {
    subject: (receiverName) => `${receiverName} ha confirmado su elección`,
    title: (receiverName) => `${receiverName} ha confirmado su elección`,
    body: 'Abre tu espacio regalo para comprobar el pedido y proceder al pago.',
    activeUntil: (date) => `La oferta de regalo sigue activa hasta el ${date}.`,
    stockReservedUntil: (n, date) =>
      `El stock que ha elegido ${n} te queda reservado hasta el ${date}. Pasado ese plazo, el stock se liberará.`,
    ctaLabel: 'Tu espacio regalo',
    ctaFallbackHint: 'Si el botón no funciona, puedes usar este enlace:',
  },
  it: {
    subject: (receiverName) => `${receiverName} ha confermato la sua scelta`,
    title: (receiverName) => `${receiverName} ha confermato la sua scelta`,
    body: 'Apri il tuo spazio regalo per verificare l’ordine e procedere al pagamento.',
    activeUntil: (date) => `L’offerta regalo resta attiva fino al ${date}.`,
    stockReservedUntil: (n, date) =>
      `Lo stock scelto da ${n} ti è riservato fino al ${date}. Dopo quel termine, lo stock verrà liberato.`,
    ctaLabel: 'Il tuo spazio regalo',
    ctaFallbackHint: 'Se il pulsante non funziona, puoi usare questo link:',
  },
  nl: {
    subject: (receiverName) => `${receiverName} heeft de keuze bevestigd`,
    title: (receiverName) => `${receiverName} heeft de keuze bevestigd`,
    body: 'Open je cadeauruimte om de bestelling te controleren en te betalen.',
    activeUntil: (date) => `Het cadeau-aanbod blijft actief tot ${date}.`,
    stockReservedUntil: (n, date) =>
      `De voorraad die ${n} koos, is voor jou gereserveerd tot ${date}. Daarna wordt de voorraad vrijgegeven.`,
    ctaLabel: 'Jouw cadeauruimte',
    ctaFallbackHint: 'Werkt de knop niet, dan kun je deze link gebruiken:',
  },
  pt: {
    subject: (receiverName) => `${receiverName} confirmou a escolha`,
    title: (receiverName) => `${receiverName} confirmou a escolha`,
    body: 'Abre o teu espaço presente para verificar a encomenda e proceder ao pagamento.',
    activeUntil: (date) => `A oferta presente permanece ativa até ${date}.`,
    stockReservedUntil: (n, date) =>
      `O stock escolhido por ${n} fica-te reservado até ${date}. Depois desse prazo, o stock será libertado.`,
    ctaLabel: 'O teu espaço presente',
    ctaFallbackHint: 'Se o botão não funcionar, podes usar este link:',
  },
  th: {
    subject: (receiverName) => `${receiverName} ยืนยันการเลือกแล้ว`,
    title: (receiverName) => `${receiverName} ยืนยันการเลือกแล้ว`,
    body: 'เปิดพื้นที่ของขวัญเพื่อตรวจคำสั่งซื้อและชำระเงิน',
    activeUntil: (date) => `ข้อเสนอของขวัญยังใช้ได้ถึงวันที่ ${date}`,
    stockReservedUntil: (n, date) =>
      `สต็อกที่ ${n} เลือก สงวนไว้ให้คุณถึงวันที่ ${date} หลังจากนั้นสต็อกจะถูกปล่อย`,
    ctaLabel: 'พื้นที่ของขวัญของคุณ',
    ctaFallbackHint: 'ถ้าปุ่มใช้ไม่ได้ คุณสามารถใช้ลิงก์นี้:',
  },
};
