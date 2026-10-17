import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { savePhoto } from '../../../media/storage.js';
import { hashPhotoBuffer } from '../../../media/photoHash.js';

export async function addPhoto(
  client: pg.Pool,
  setId: string,
  shapeKey: string,
  lengthKey: string,
  modal: Buffer,
  originalFilename: string,
  expectedHash?: string | null,
  /** Single-nail variation option; `''` for everything else. */
  variationKey = '',
): Promise<{ position: number; contentHash: string }> {
  const { rows } = await client.query<{ max: number | null }>(
    `select max("position") as max from product_photos
     where product_id = $1 and shape_key = $2 and length_key = $3 and variation_key = $4`,
    [setId, shapeKey, lengthKey, variationKey],
  );
  const nextPosition = (rows[0]?.max ?? 0) + 1;

  const contentHash = hashPhotoBuffer(modal);
  if (expectedHash && expectedHash !== contentHash) {
    throw new Error(
      `Photo hash mismatch for ${originalFilename}: expected ${expectedHash}, got ${contentHash}`,
    );
  }

  const saved = await savePhoto(
    modal,
    originalFilename,
    setId,
    shapeKey,
    lengthKey,
    nextPosition,
    contentHash,
    variationKey,
  );

  await client.query(
    `insert into product_photos (id, product_id, shape_key, length_key, variation_key, "position", small_path, modal_path, content_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      setId,
      shapeKey,
      lengthKey,
      variationKey,
      nextPosition,
      saved.smallPath,
      saved.modalPath,
      contentHash,
    ],
  );

  return { position: nextPosition, contentHash };
}

/** Deletes product_photos rows only — disk files are left in place. Paths are
 * content-addressed (`<position>-<modalSha256>…`), so a later re-upload writes
 * a new file rather than overwriting; order snapshots that still name the old
 * path keep serving the historical bytes. */
export async function deleteAllPhotosForSet(client: pg.Pool, setId: string): Promise<void> {
  await client.query(`delete from product_photos where product_id = $1`, [setId]);
}
