import type { MailMessage } from './email.js';
import { spyNoticeHtml } from './emailTemplates.js';

export interface CompositionSizeRequestNailLine {
  productUid: string;
  title: string;
  /** French shape name, or the raw key when the shape is unknown. */
  shapeLabel: string;
  /** French length name, or the raw key. */
  lengthLabel: string;
  /** French option name when the nail has a variation. */
  variationLabel: string | null;
  /** French finger name. */
  fingerLabel: string;
  /** False when this shape, length and option are not offered in the asked size. */
  offered: boolean;
  /** Stored request id, only for nails that are not offered. */
  publicId: string | null;
}

/** One mail for a whole composed set: which nails are missing the asked
 * size, and which nails in the same set already have it. */
export function compositionSizeRequestSpyEmail(data: {
  email: string;
  userId: string | null;
  size: string;
  quantity: number;
  comment?: string;
  nails: CompositionSizeRequestNailLine[];
}): Omit<MailMessage, 'to'> {
  const comment = data.comment?.trim();
  const missing = data.nails.filter((nail) => !nail.offered);
  const offered = data.nails.filter((nail) => nail.offered);
  const formatNail = (nail: CompositionSizeRequestNailLine) => {
    const variant = [nail.shapeLabel, nail.lengthLabel, nail.variationLabel].filter(Boolean).join(', ');
    const request = nail.publicId ? ` (demande ${nail.publicId})` : '';
    return `${nail.productUid} ${nail.title}, ${variant}, doigt: ${nail.fingerLabel}${request}`;
  };
  const missingText = missing.map((nail) => `- ${formatNail(nail)}`).join('\n');
  const offeredText = offered.length > 0 ? offered.map((nail) => `- ${formatNail(nail)}`).join('\n') : '- aucun';
  const fields = [
    { label: 'Client', value: data.email },
    { label: 'ID utilisateur', value: data.userId ?? 'Non connecté' },
    { label: 'Taille demandée', value: data.size },
    { label: 'Quantité de sets', value: String(data.quantity) },
    { label: 'Ongles non proposés dans cette taille', value: missingText },
    { label: 'Autres ongles du set (déjà proposés)', value: offeredText },
    ...(comment ? [{ label: 'Commentaire', value: comment }] : []),
  ];
  return {
    subject: `Demande de taille pour un set sur mesure (taille ${data.size} x${data.quantity})`,
    replyTo: data.email,
    text: `Un client demande une taille qui n'est pas proposée pour un set sur mesure.\n\nClient : ${data.email}\nID utilisateur : ${data.userId ?? 'Non connecté'}\nTaille demandée : ${data.size}\nQuantité de sets : ${data.quantity}\n\nOngles non proposés dans cette taille :\n${missingText}\n\nAutres ongles du set (déjà proposés) :\n${offeredText}${comment ? `\n\nCommentaire : ${comment}` : ''}`,
    html: spyNoticeHtml({
      title: 'Demande de taille pour un set sur mesure',
      fields,
    }),
    kind: 'spy',
  };
}
