/** Reconcile product_photos rows with the document's photo list and uploads. */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { encodeAdminProductPhoto } from '../../../media/adminProductPhoto.js';
import { saveAdminPhoto } from '../../../media/saveAdminPhoto.js';
import { CatalogueDocumentError, type CataloguePhotoSlot } from '../domain/catalogueDocument.js';

interface PhotoRow {
  id: string;
  shape_key: string;
  length_key: string;
  variation_key: string;
  position: number;
  small_path: string;
  modal_path: string;
  content_hash: string;
}

export interface UploadedCataloguePhoto {
  /** Filename stem without extension (`z.kit` from `z.kit.webp`). */
  photo: string;
  buffer: Buffer;
  originalName: string;
}

function variantKey(shapeKey: string, lengthKey: string, variationKey: string): string {
  return `${shapeKey}\0${lengthKey}\0${variationKey}`;
}

function stemFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** Apply the document photo list: keep by hash, replace/add from uploads,
 * detach rows missing from the document. Disk files of detached rows stay. */
export async function reconcileCataloguePhotos(
  client: pg.Pool | pg.PoolClient,
  productId: string,
  slots: CataloguePhotoSlot[],
  uploads: UploadedCataloguePhoto[],
): Promise<{ kept: number; uploaded: number; removed: number }> {
  const uploadByPhoto = new Map<string, UploadedCataloguePhoto>();
  for (const upload of uploads) {
    const stem = stemFromFilename(upload.photo || upload.originalName);
    if (uploadByPhoto.has(stem)) {
      throw new CatalogueDocumentError(`Duplicate upload for photo ${JSON.stringify(stem)}.`);
    }
    uploadByPhoto.set(stem, { ...upload, photo: stem });
  }

  const { rows: existing } = await client.query<PhotoRow>(
    `select id, shape_key, length_key, variation_key, "position", small_path, modal_path, content_hash
       from product_photos where product_id = $1
       order by shape_key, length_key, variation_key, "position"`,
    [productId],
  );
  const byHash = new Map<string, PhotoRow>();
  for (const row of existing) {
    if (row.content_hash) byHash.set(row.content_hash.toLowerCase(), row);
  }

  type Planned =
    | { kind: 'keep'; row: PhotoRow; position: number; shapeKey: string; lengthKey: string; variationKey: string }
    | {
        kind: 'upload';
        upload: UploadedCataloguePhoto;
        position: number;
        shapeKey: string;
        lengthKey: string;
        variationKey: string;
      };

  const planned: Planned[] = [];
  const usedRowIds = new Set<string>();
  const positionByVariant = new Map<string, number>();

  for (const slot of slots) {
    const key = variantKey(slot.shapeKey, slot.lengthKey, slot.variationKey);
    const position = (positionByVariant.get(key) ?? 0) + 1;
    positionByVariant.set(key, position);
    const upload = uploadByPhoto.get(slot.photo);
    if (upload) {
      planned.push({
        kind: 'upload',
        upload,
        position,
        shapeKey: slot.shapeKey,
        lengthKey: slot.lengthKey,
        variationKey: slot.variationKey,
      });
      uploadByPhoto.delete(slot.photo);
      continue;
    }
    if (slot.hash) {
      const row = byHash.get(slot.hash.toLowerCase());
      if (row && !usedRowIds.has(row.id)) {
        planned.push({
          kind: 'keep',
          row,
          position,
          shapeKey: slot.shapeKey,
          lengthKey: slot.lengthKey,
          variationKey: slot.variationKey,
        });
        usedRowIds.add(row.id);
        continue;
      }
    }
    throw new CatalogueDocumentError(
      `Photo ${JSON.stringify(slot.photo)} needs a matching hash or an uploaded file.`,
    );
  }

  if (uploadByPhoto.size > 0) {
    const unused = [...uploadByPhoto.keys()].sort().join(', ');
    throw new CatalogueDocumentError(`Uploaded file(s) not named in photos: ${unused}.`);
  }

  const keepIds = new Set(planned.filter((item) => item.kind === 'keep').map((item) => item.row.id));
  let removed = 0;
  for (const row of existing) {
    if (keepIds.has(row.id)) continue;
    await client.query(`delete from product_photos where id = $1`, [row.id]);
    removed += 1;
  }

  // Two-phase position update so (product, variant, position) never collides.
  for (const item of planned) {
    if (item.kind !== 'keep') continue;
    await client.query(`update product_photos set "position" = $2 where id = $1`, [
      item.row.id,
      -item.position,
    ]);
  }

  let kept = 0;
  let uploaded = 0;
  for (const item of planned) {
    if (item.kind === 'keep') {
      await client.query(
        `update product_photos
            set shape_key = $2, length_key = $3, variation_key = $4, "position" = $5
          where id = $1`,
        [item.row.id, item.shapeKey, item.lengthKey, item.variationKey, item.position],
      );
      kept += 1;
      continue;
    }
    const encoded = await encodeAdminProductPhoto(item.upload.buffer);
    const saved = await saveAdminPhoto(
      encoded.modal,
      encoded.small,
      productId,
      item.shapeKey,
      item.lengthKey,
      item.position,
      encoded.contentHash,
      item.variationKey,
    );
    await client.query(
      `insert into product_photos
         (id, product_id, shape_key, length_key, variation_key, "position", small_path, modal_path, content_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        productId,
        item.shapeKey,
        item.lengthKey,
        item.variationKey,
        item.position,
        saved.smallPath,
        saved.modalPath,
        encoded.contentHash,
      ],
    );
    uploaded += 1;
  }

  return { kept, uploaded, removed };
}

/** Read modal bytes of an existing photo (for tests / rare re-hash). */
export async function readModalBytes(modalRelativePath: string): Promise<Buffer> {
  return readFile(join(config.mediaDir, modalRelativePath.replace(/^\/+/, '')));
}
