import type { GiftShareCardStyle } from '../domain/shareCardStyle.js';

export type GiftShareCardLayout = 'spread' | 'packEnd' | 'stack' | 'hangTag' | 'celeste';
export type GiftShareCardQrSide = 'left' | 'right';
export type GiftShareCardNameFace = 'serif' | 'sans' | 'script' | 'cinzel';
export type GiftShareCardOccasionFace = 'script' | 'cinzel';

export interface GiftShareCardGradientStop {
  offset: number;
  color: string;
}

export interface GiftShareCardNailPos {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  w?: number;
  h?: number;
}

export interface GiftShareCardTheme {
  id: GiftShareCardStyle;
  bg: string;
  stops: GiftShareCardGradientStop[];
  angle: number;
  ink: string;
  soft: string;
  accent: string;
  msg: string;
  cap: string;
  qrLight: string;
  qrDark: string;
  dark: boolean;
  layout: GiftShareCardLayout;
  qr: GiftShareCardQrSide;
  nameFace: GiftShareCardNameFace;
  occasion?: GiftShareCardOccasionFace;
  rule?: boolean;
  align: 'left' | 'right';
  /** Brand sits at the top-right (next to the nail) or top-left, out of the name row. */
  brandPin?: 'topRight' | 'topLeft';
  /** Extra top offset for an in-flow brand, in cqw. */
  brandNudge?: number;
  /** Top offset for a pinned brand, in cqw. Default 1. */
  brandPinTop?: number;
  /** Receiver name uses the full inner width and may run above the QR. */
  nameOverQr?: boolean;
  /** Receiver name sits under the brand, full inner width, above the QR. */
  nameAboveQr?: boolean;
  pad: [number, number, number, number];
  nail: GiftShareCardNailPos;
}

export function lin(
  angle: number,
  from: string,
  to: string,
  toAt = 1,
): Pick<GiftShareCardTheme, 'bg' | 'stops' | 'angle'> {
  const bg =
    toAt < 1
      ? `linear-gradient(${angle}deg,${from},${to} ${Math.round(toAt * 100)}%)`
      : `linear-gradient(${angle}deg,${from},${to})`;
  return {
    bg,
    angle,
    stops: [
      { offset: 0, color: from },
      { offset: toAt, color: to },
    ],
  };
}

export function solid(color: string): Pick<GiftShareCardTheme, 'bg' | 'stops' | 'angle'> {
  return {
    bg: color,
    angle: 180,
    stops: [
      { offset: 0, color },
      { offset: 1, color },
    ],
  };
}

export function tri(
  angle: number,
  a: string,
  b: string,
  c: string,
): Pick<GiftShareCardTheme, 'bg' | 'stops' | 'angle'> {
  return {
    bg: `linear-gradient(${angle}deg,${a} 0%,${b} 46%,${c} 100%)`,
    angle,
    stops: [
      { offset: 0, color: a },
      { offset: 0.46, color: b },
      { offset: 1, color: c },
    ],
  };
}
