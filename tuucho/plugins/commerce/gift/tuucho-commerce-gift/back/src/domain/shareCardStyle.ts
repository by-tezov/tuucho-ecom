export const GIFT_SHARE_CARD_STYLES = [
  'classic',
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
  pamsurin: 'classic',
  tuucho: 'classic',
  gift: 'classic',
  party: 'fete',
  felicitations: 'diplome',
  koi: 'classic',
  zodiaque: 'celeste',
  vache: 'classic',
  naissance: 'classic',
  marbre: 'classic',
  tigre: 'classic',
  leopard: 'classic',
  zebre: 'classic',
  girafe: 'classic',
  paon: 'classic',
  dalmatien: 'classic',
};

/** Persist the canonical theme id. Historical `pamsurin` rows map to classic on read. */
export function persistGiftShareCardStyle(style: GiftShareCardStyle): string {
  return style;
}

export function parseGiftShareCardStyle(value: unknown): GiftShareCardStyle | null {
  if (typeof value !== 'string') return null;
  if ((GIFT_SHARE_CARD_STYLES as readonly string[]).includes(value)) {
    return value as GiftShareCardStyle;
  }
  return LEGACY_SHARE_CARD_STYLES[value] ?? null;
}
