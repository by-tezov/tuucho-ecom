/** Encode an admin catalogue upload to modal + small WebP, matching
 * catalog source prepare sizes (modal longest side 1600, small 400 cover). */
import { loadSharp } from './sharp.js';
import { hashPhotoBuffer } from './photoHash.js';

const MODAL_MAX = 1600;
const SMALL_SIZE = 400;
const MODAL_QUALITY = 85;
const SMALL_QUALITY = 82;

export interface EncodedAdminProductPhoto {
  modal: Buffer;
  small: Buffer;
  contentHash: string;
}

export async function encodeAdminProductPhoto(input: Buffer): Promise<EncodedAdminProductPhoto> {
  const sharp = await loadSharp();
  const modal = await sharp(input)
    .rotate()
    .resize(MODAL_MAX, MODAL_MAX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: MODAL_QUALITY })
    .toBuffer();
  const small = await sharp(input)
    .rotate()
    .resize(SMALL_SIZE, SMALL_SIZE, { fit: 'cover' })
    .webp({ quality: SMALL_QUALITY })
    .toBuffer();
  return { modal, small, contentHash: hashPhotoBuffer(modal) };
}
