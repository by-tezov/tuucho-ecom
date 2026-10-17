/** Persist an admin-encoded product photo (distinct modal + small WebP). */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config/env.js';

export interface SavedAdminPhoto {
  smallPath: string;
  modalPath: string;
}

export async function saveAdminPhoto(
  modal: Buffer,
  small: Buffer,
  setId: string,
  shapeKey: string,
  lengthKey: string,
  position: number,
  contentHash: string,
  variationKey = '',
): Promise<SavedAdminPhoto> {
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) {
    throw new Error(
      `saveAdminPhoto: contentHash must be a 64-char hex SHA-256, got ${JSON.stringify(contentHash)}`,
    );
  }
  const hash = contentHash.toLowerCase();
  const relativeDir = variationKey
    ? join(setId, shapeKey, lengthKey, variationKey)
    : join(setId, shapeKey, lengthKey);
  const smallRelative = join(relativeDir, 'small', `${position}-${hash}.webp`);
  const modalRelative = join(relativeDir, 'modal', `${position}-${hash}.webp`);
  const smallAbsolute = join(config.mediaDir, smallRelative);
  const modalAbsolute = join(config.mediaDir, modalRelative);
  await mkdir(dirname(smallAbsolute), { recursive: true });
  await mkdir(dirname(modalAbsolute), { recursive: true });
  await writeFile(modalAbsolute, modal);
  await writeFile(smallAbsolute, small);
  return {
    smallPath: smallRelative.split('\\').join('/'),
    modalPath: modalRelative.split('\\').join('/'),
  };
}
