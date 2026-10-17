import { readFile, rename, writeFile } from 'node:fs/promises';
import { loadSharp } from './sharp.js';
import {
  CHAT_IMAGE_THUMB_EDGE,
  PRIVATE_IMAGE_MAX_EDGE,
  PRIVATE_IMAGE_MAX_PIXELS,
  PrivateUploadError,
  type MulterLikeFile,
} from './privateImagePolicy.js';

export async function readUploadedImage(file: MulterLikeFile): Promise<Buffer> {
  if (file.buffer) return file.buffer;
  if (file.path) return readFile(file.path);
  throw new PrivateUploadError('processing_failed');
}

export async function normalizePrivateImageToJpeg(buffer: Buffer, maxBytes: number): Promise<Buffer> {
  let output: Buffer;
  try {
    const sharp = await loadSharp();
    output = await sharp(buffer, { limitInputPixels: PRIVATE_IMAGE_MAX_PIXELS })
      .rotate()
      .resize({
        width: PRIVATE_IMAGE_MAX_EDGE,
        height: PRIVATE_IMAGE_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new PrivateUploadError('processing_failed');
  }
  if (output.byteLength > maxBytes) throw new PrivateUploadError('too_large');
  return output;
}

/** Session-gated chat/contact vignette. Full originals are served as-is. */
export async function chatImagePreviewJpeg(source: Buffer): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(source, { limitInputPixels: PRIVATE_IMAGE_MAX_PIXELS })
    .rotate()
    .resize({
      width: CHAT_IMAGE_THUMB_EDGE,
      height: CHAT_IMAGE_THUMB_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

/** Path of the cached vignette kept beside a private original. */
export function chatImagePreviewPath(absolutePath: string): string {
  return `${absolutePath}.preview.jpg`;
}

/** The vignette of a stored private image, encoded once and then read back:
 * the account chat refetches its images on every SSE frame, and each view
 * used to decode, resize and mozjpeg-encode the original again. Written
 * beside the original (same private directory, mode 0600, temp file then
 * rename so a concurrent reader never sees half a file). A failed write still
 * serves the freshly encoded bytes. */
export async function cachedChatImagePreview(absolutePath: string): Promise<Buffer> {
  const previewPath = chatImagePreviewPath(absolutePath);
  try {
    return await readFile(previewPath);
  } catch {
    // not cached yet
  }
  const preview = await chatImagePreviewJpeg(await readFile(absolutePath));
  const tempPath = `${previewPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, preview, { mode: 0o600 });
    await rename(tempPath, previewPath);
  } catch (error) {
    console.error('[media] chat preview cache write failed', error);
  }
  return preview;
}
