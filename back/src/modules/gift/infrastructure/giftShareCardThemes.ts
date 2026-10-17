import type { GiftShareCardStyle } from '../domain/shareCardStyle.js';
import type { GiftShareCardTheme } from './shareCardThemeFill.js';
import { SHARE_CARD_THEMES_CLASSIC } from './shareCardThemesClassic.js';
import { SHARE_CARD_THEMES_MORE } from './shareCardThemesMore.js';

export type {
  GiftShareCardGradientStop,
  GiftShareCardLayout,
  GiftShareCardNameFace,
  GiftShareCardNailPos,
  GiftShareCardOccasionFace,
  GiftShareCardQrSide,
  GiftShareCardTheme,
} from './shareCardThemeFill.js';

/** Print palettes and layout from the gift card proto. */
export const GIFT_SHARE_CARD_THEMES: Record<GiftShareCardStyle, GiftShareCardTheme> = {
  ...SHARE_CARD_THEMES_CLASSIC,
  ...SHARE_CARD_THEMES_MORE,
};

export function giftShareCardTheme(style: GiftShareCardStyle): GiftShareCardTheme {
  return GIFT_SHARE_CARD_THEMES[style];
}
