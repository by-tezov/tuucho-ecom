import { writeFile } from 'node:fs/promises';
import { loadSharp } from '../../../media/sharp.js';
import {
  GIFT_SHARE_CARD_HEIGHT_PT,
  GIFT_SHARE_CARD_WIDTH_PT,
  paintGiftShareCardFace,
  type GiftShareCardPdfInput,
} from './giftShareCardPdf.js';
import { createCanvasShareSurface } from './shareCardSurface.js';

/** Print-size JPEG: 5 x 3 inches at 300 dpi. */
const GIFT_SHARE_CARD_JPEG_DPI = 300;

/**
 * Card-only JPEG at 5 x 3 inches. Same face painter as the cut-out on the A4
 * PDF. Rasterized on node-canvas (pdfjs does not paint these glyph outlines).
 */
export async function renderGiftShareCardJpeg(input: GiftShareCardPdfInput): Promise<Buffer> {
  const width = Math.round((GIFT_SHARE_CARD_WIDTH_PT * GIFT_SHARE_CARD_JPEG_DPI) / 72);
  const height = Math.round((GIFT_SHARE_CARD_HEIGHT_PT * GIFT_SHARE_CARD_JPEG_DPI) / 72);
  // Native addons, loaded on first use rather than at server start (cold
  // starts on the LWS host); sharp through loadSharp for its host settings.
  const { createCanvas } = await import('canvas');
  const sharp = await loadSharp();
  const canvas = createCanvas(width, height);
  const surface = createCanvasShareSurface(canvas.getContext('2d'), GIFT_SHARE_CARD_JPEG_DPI);
  await paintGiftShareCardFace(
    surface,
    { x: 0, y: 0, w: GIFT_SHARE_CARD_WIDTH_PT, h: GIFT_SHARE_CARD_HEIGHT_PT },
    input,
  );
  return sharp(canvas.toBuffer('image/png'))
    .withMetadata({ density: GIFT_SHARE_CARD_JPEG_DPI })
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

export async function writeGiftShareCardJpeg(
  absolutePath: string,
  input: GiftShareCardPdfInput,
): Promise<void> {
  await writeFile(absolutePath, await renderGiftShareCardJpeg(input));
}
