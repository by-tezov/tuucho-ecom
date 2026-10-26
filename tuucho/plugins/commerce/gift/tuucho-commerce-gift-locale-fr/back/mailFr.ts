import type { GiftNoticeMailCopy } from '../../tuucho-commerce-gift/back/src/domain/giftNoticeMailCopy.js';
import type { GiftSelectReminderMailCopy } from '../../tuucho-commerce-gift/back/src/domain/giftSelectReminderMailCopy.js';
import type { GiftShareCardMailCopy } from '../../tuucho-commerce-gift/back/src/domain/giftShareCardMailCopy.js';
import type { GiverPromiseMailCopy } from '../../tuucho-commerce-gift/back/src/domain/giverPromiseMailCopy.js';

export const frGiftShareCard: GiftShareCardMailCopy = {
  subject: (receiverName) => `Carte cadeau pour ${receiverName}`,
  title: 'Ta carte cadeau est prête',
  intro: (giverDisplayName) => `Bonjour ${giverDisplayName},`,
  filesParagraph:
    'Deux fichiers sont joints à cet e-mail : un PDF et un JPG. Le PDF place ta carte 5 x 3 pouces sur une page A4. Imprime-le et découpe-la le long des pointillés. Le JPG est la carte seule, au même format, pour l’envoyer telle quelle.',
  codeParagraph:
    'Donne aussi le code à 4 chiffres choisi à la création. Sans ce code, on ne peut pas ouvrir le cadeau. Le code te permettra aussi d’accéder à l’espace cadeau pour procéder au paiement. N’oublie pas ce code, sans lui tu ne pourras pas finaliser ton cadeau.',
  securityParagraph:
    'Pour plus de sécurité, ne communique pas le code par le même canal que la carte ou le lien : par exemple imprime la carte et envoie le code par SMS.',
  trackParagraph: 'Pour suivre le cadeau ou payer plus tard, ouvre ton espace cadeau.',
  activeUntil: (date) => `L’offre cadeau reste active jusqu’au ${date}.`,
  activeUntilDefault: 'L’offre cadeau reste active selon la durée réglée dans la boutique.',
  ctaLabel: 'Ton espace cadeau',
  ctaFallbackHint: 'Si le bouton ne fonctionne pas, tu peux utiliser ce lien :',
};

export const frGiftNotice: GiftNoticeMailCopy = {
  cancelledTitle: 'Cadeau non payé',
  cancelledBody: (receiver) => `Le cadeau pour ${receiver} a été annulé. Aucune commande n’a été créée.`,
  someone: 'le destinataire',
  holdTitle: 'Le stock n’est plus garanti bientôt',
  payTitle: 'Derniers jours pour payer',
  reminderBody: 'Ouvre le lien du cadeau pour payer. Aucun prélèvement automatique.',
  reminderCta: 'Payer le cadeau',
  ctaFallbackHint: 'Si le bouton ne fonctionne pas, tu peux utiliser ce lien :',
};

export const frGiftSelectReminder: GiftSelectReminderMailCopy = {
  subject: (n) => `${n} n’a pas encore choisi son cadeau`,
  title: (n) => `${n} n’a pas encore choisi son cadeau`,
  notChosen: (n) => `${n} n’a pas encore validé de choix. Tu peux lui renvoyer le lien depuis ton espace cadeau.`,
  activeUntil: (date) => `L’offre cadeau expire le ${date}.`,
  extend: (days) => `Besoin de plus de temps ? Depuis ton espace cadeau, tu peux prolonger l’offre de ${days} jours.`,
  ctaLabel: 'Ton espace cadeau',
  ctaFallbackHint: 'Si le bouton ne fonctionne pas, tu peux utiliser ce lien :',
};

export const frGiverPromise: GiverPromiseMailCopy = {
  subject: (receiverName) => `${receiverName} a confirmé son choix`,
  title: (receiverName) => `${receiverName} a confirmé son choix`,
  body: 'Ouvre ton espace cadeau pour vérifier la commande et procéder au paiement.',
  activeUntil: (date) => `L’offre cadeau reste active jusqu’au ${date}.`,
  stockReservedUntil: (n, date) =>
    `Le stock choisi par ${n} t’est réservé jusqu’au ${date}. Après ce délai, le stock sera libéré.`,
  ctaLabel: 'Ton espace cadeau',
  ctaFallbackHint: 'Si le bouton ne fonctionne pas, tu peux utiliser ce lien :',
};

export const frGiftShareCardPdf = {
  title: 'Carte cadeau Shop',
  printHint:
    'Imprime cette page, découpe la carte 5 x 3 pouces le long des pointillés, et offre-la. Le code à 4 chiffres n’est pas sur cette feuille : donne-le à part.',
  footer: 'Shop',
  useBefore: 'À utiliser avant',
  faceAlt: 'Carte cadeau Shop de {giver} pour {receiver}, avec un QR code qui ouvre la page du cadeau.',
  messageLabel: 'Message :',
};
