import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config/env.js';
import { resolvePluginPrivatePath } from '../modules/plugins/application/pluginSettingValues.js';
import { sanitizeOriginalImageName } from './privateImageNames.js';
import {
  PRIVATE_IMAGE_ALLOWED_MIME,
  PRIVATE_IMAGE_MAX_COUNT,
  PrivateUploadError,
  type MulterLikeFile,
  type SavedPrivateImage,
} from './privateImagePolicy.js';
import { normalizePrivateImageToJpeg, readUploadedImage } from './privateImageProcessing.js';
import { assertUploadedImageMagic } from './imageMagic.js';

// Compatibility facade: callers can migrate to the focused modules gradually.
export * from './privateImageNames.js';
export * from './privateImagePolicy.js';
export { cachedChatImagePreview, chatImagePreviewJpeg } from './privateImageProcessing.js';
import { chatImagePreviewPath } from './privateImageProcessing.js';

/** Validate + sharp-normalize + write under a private media directory.
 * Never returns a public URL. */
export async function savePrivateImages(input: {
  files: MulterLikeFile[];
  targetDir: string;
  maxBytes: number;
  fileNameFor: (index: number) => string;
}): Promise<SavedPrivateImage[]> {
  if (input.files.length > PRIVATE_IMAGE_MAX_COUNT) {
    throw new PrivateUploadError('too_many');
  }
  if (input.files.length === 0) return [];

  for (const file of input.files) {
    if (!PRIVATE_IMAGE_ALLOWED_MIME.has(file.mimetype)) {
      throw new PrivateUploadError('invalid_type');
    }
    try {
      await assertUploadedImageMagic(file);
    } catch {
      throw new PrivateUploadError('invalid_type');
    }
  }

  await mkdir(input.targetDir, { recursive: true });

  const saved: SavedPrivateImage[] = [];
  try {
    for (let i = 0; i < input.files.length; i += 1) {
      const file = input.files[i]!;
      try {
        const jpeg = await normalizePrivateImageToJpeg(await readUploadedImage(file), input.maxBytes);
        const fileName = input.fileNameFor(i);
        const absolutePath = join(input.targetDir, fileName);
        await writeFile(absolutePath, jpeg, { flag: 'wx', mode: 0o600 });
        saved.push({
          fileName,
          originalName: sanitizeOriginalImageName(file.originalname),
          absolutePath,
          bytes: jpeg.byteLength,
          contentType: 'image/jpeg',
        });
      } finally {
        if (file.path) await unlink(file.path).catch(() => undefined);
      }
    }
  } catch (error) {
    await removeSavedPrivateImages(saved);
    throw error;
  }
  return saved;
}

/** Best-effort cleanup for files created by a request that did not complete. */
export async function removeSavedPrivateImages(
  images: Pick<SavedPrivateImage, 'absolutePath'>[],
): Promise<void> {
  await Promise.all(
    images.map(async (image) => {
      try {
        await unlink(image.absolutePath);
      } catch {
        // Cleanup must never hide the original upload/delivery error.
      }
    }),
  );
}

export function contactMediaAbsolutePath(fileName: string): string {
  return join(
    resolvePluginPrivatePath(config.privateDir, 'tuucho-contact', 'mediaContactDir', '/media/contact'),
    fileName,
  );
}

export function chatMediaAbsolutePath(fileName: string): string {
  return join(
    resolvePluginPrivatePath(config.privateDir, 'tuucho-contact', 'mediaChatDir', '/media/chat'),
    fileName,
  );
}

/** Removes a chat attachment and its cached vignette (cachedChatImagePreview). */
export async function unlinkChatMedia(fileName: string): Promise<void> {
  const absolutePath = chatMediaAbsolutePath(fileName);
  await unlink(chatImagePreviewPath(absolutePath)).catch(() => undefined);
  await unlink(absolutePath);
}
