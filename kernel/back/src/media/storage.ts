import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { config } from '../config/env.js';

export interface SavedPhoto {
  /** Path relative to MEDIA_DIR — this is what gets stored in
   * product_photos.small_path/modal_path. */
  smallPath: string;
  modalPath: string;
}

/** Every photo arrives already at modal quality/size — resizing happens
 * before it reaches this backend (catalog source's prepare-library.mjs),
 * never here. This saves the modal under
 * MEDIA_DIR/<setId>/<shapeKey>/<lengthKey>[/<variationKey>]/modal/<position>-<contentHash><ext>
 * (the variation segment only for a single nail's variation option)
 * and the grid file at
 * .../small/<position>-<contentHash><ext>.
 *
 * Small used to be a sharp square-crop of the modal. Loading sharp inside
 * loopback `opsServer` on CloudLinux aborts the process (SIGABRT / glib
 * thread exhaustion), which left catalogue rows with empty photo arrays.
 * The modal bytes are therefore written to both paths. Manager `small/`
 * sources remain the prepared grid size; the importer currently sends
 * modal files only.
 *
 * Filenames include the modal SHA-256 so a library re-import of different
 * bytes never overwrites a previous file — order snapshots that still
 * point at the old path keep working. Identical content (same hash) is
 * idempotent: rewriting the same path with the same bytes is fine. */
export async function savePhoto(
  modal: Buffer,
  originalFilename: string,
  setId: string,
  shapeKey: string,
  lengthKey: string,
  position: number,
  contentHash: string,
  variationKey = '',
): Promise<SavedPhoto> {
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) {
    throw new Error(
      `savePhoto: contentHash must be a 64-char hex SHA-256, got ${JSON.stringify(contentHash)}`,
    );
  }
  const hash = contentHash.toLowerCase();
  const ext = extname(originalFilename).toLowerCase() || '.jpg';
  const imageFormat = ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : 'jpeg';
  const smallExt = imageFormat === 'png' ? '.png' : imageFormat === 'webp' ? '.webp' : '.jpg';

  const relativeDir = variationKey ? join(setId, shapeKey, lengthKey, variationKey) : join(setId, shapeKey, lengthKey);
  const smallRelative = join(relativeDir, 'small', `${position}-${hash}${smallExt}`);
  const modalRelative = join(relativeDir, 'modal', `${position}-${hash}${ext}`);

  const smallAbsolute = join(config.mediaDir, smallRelative);
  const modalAbsolute = join(config.mediaDir, modalRelative);
  await mkdir(dirname(smallAbsolute), { recursive: true });
  await mkdir(dirname(modalAbsolute), { recursive: true });

  await writeFile(modalAbsolute, modal);
  await writeFile(smallAbsolute, modal);

  return {
    smallPath: smallRelative.split('\\').join('/'),
    modalPath: modalRelative.split('\\').join('/'),
  };
}
