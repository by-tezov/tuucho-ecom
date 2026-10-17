export const GIFT_SHARE_CARD_STYLES = [
  'pamsurin',
  'anniversaire',
  'mariage',
  'fete',
  'noel',
  'valentin',
  'meres',
  'merci',
  'diplome',
  'amitie',
  'minimal',
  'coquin',
  'manga',
  'halloween',
  'nouvelan',
  'artdeco',
  'botanique',
  'neon',
  'celeste',
  'fantastique',
] as const;

export type GiftShareCardStyle = (typeof GIFT_SHARE_CARD_STYLES)[number];

/** Older create payloads still accepted and stored as the mapped style. */
const LEGACY_SHARE_CARD_STYLES: Record<string, GiftShareCardStyle> = {
  qr: 'minimal',
  birthday: 'anniversaire',
  gift: 'pamsurin',
  party: 'fete',
  felicitations: 'diplome',
  koi: 'pamsurin',
  zodiaque: 'celeste',
  vache: 'pamsurin',
  naissance: 'pamsurin',
  marbre: 'pamsurin',
  tigre: 'pamsurin',
  leopard: 'pamsurin',
  zebre: 'pamsurin',
  girafe: 'pamsurin',
  paon: 'pamsurin',
  dalmatien: 'pamsurin',
};

export function parseGiftShareCardStyle(value: unknown): GiftShareCardStyle | null {
  if (typeof value !== 'string') return null;
  if ((GIFT_SHARE_CARD_STYLES as readonly string[]).includes(value)) {
    return value as GiftShareCardStyle;
  }
  return LEGACY_SHARE_CARD_STYLES[value] ?? null;
}
