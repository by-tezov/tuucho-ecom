/** Load / save / delete one admin catalogue product (JSON document + photos). */
import type { Request } from 'express';
import { pool } from '../../../db/pool.js';
import { config } from '../../../config/env.js';
import { findProductIdByProductUid } from '../../operations/application/libraryImport.js';
import { importLibrarySet, InvalidLibrarySet } from '../../operations/application/librarySetImport.js';
import { deleteSet } from '../../operations/application/adminProducts.js';
import { listLibrarySets } from '../../operations/application/libraryList.js';
import { recordAdminActivity } from '../../activity/application/recordAdminActivity.js';
import {
  CatalogueDocumentError,
  catalogueAudience,
  catalogueProductType,
  documentToImportBody,
  extractPhotoSlots,
  isBlankProductUid,
  listRowToDocument,
  pickUnusedProductUid,
  type AdminCatalogue,
  type CatalogueDocument,
} from '../domain/catalogueDocument.js';
import {
  reconcileCataloguePhotos,
  type UploadedCataloguePhoto,
} from './cataloguePhotoReconcile.js';

export interface CataloguePhotoPreview {
  photo: string;
  shapeKey: string;
  lengthKey: string;
  variationKey: string;
  hash: string;
  small: string;
  modal: string;
}

async function allocateShopProductUid(): Promise<string> {
  return pickUnusedProductUid(async (uid) => (await findProductIdByProductUid(pool, uid)) != null);
}

function mediaUrl(path: string): string {
  return `${config.publicMediaUrl}/${path.replace(/^\/+/, '')}`;
}

export async function loadCatalogueProduct(
  catalogue: AdminCatalogue,
  productUid: string,
): Promise<{ document: CatalogueDocument; photos: CataloguePhotoPreview[]; id: string } | null> {
  const productType = catalogueProductType(catalogue);
  const audience = catalogueAudience(catalogue);
  const sets = await listLibrarySets(
    pool,
    productType,
    productType === 'nail' || productType === 'nail_single' ? audience : undefined,
  );
  const row = sets.find((set) => set.productUid.toUpperCase() === productUid.toUpperCase());
  if (!row) return null;
  if (row.productType !== productType) return null;
  const document = listRowToDocument(catalogue, row);
  const slots = extractPhotoSlots(catalogue, document);
  const { rows: photoRows } = await pool.query<{
    shape_key: string;
    length_key: string;
    variation_key: string;
    content_hash: string;
    small_path: string;
    modal_path: string;
    position: number;
  }>(
    `select shape_key, length_key, variation_key, content_hash, small_path, modal_path, "position"
       from product_photos where product_id = $1
       order by shape_key, length_key, variation_key, "position"`,
    [row.id],
  );
  const byHash = new Map(photoRows.map((photo) => [photo.content_hash.toLowerCase(), photo]));
  const photos: CataloguePhotoPreview[] = slots.map((slot) => {
    const stored = slot.hash ? byHash.get(slot.hash.toLowerCase()) : undefined;
    return {
      photo: slot.photo,
      shapeKey: slot.shapeKey,
      lengthKey: slot.lengthKey,
      variationKey: slot.variationKey,
      hash: slot.hash ?? stored?.content_hash ?? '',
      small: stored ? mediaUrl(stored.small_path) : '',
      modal: stored ? mediaUrl(stored.modal_path) : '',
    };
  });
  return { document, photos, id: row.id };
}

export function parseDocumentField(raw: unknown): CatalogueDocument {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new CatalogueDocumentError('document is required.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new CatalogueDocumentError(message);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CatalogueDocumentError('Document must be a JSON object.');
  }
  return parsed as CatalogueDocument;
}

export function uploadsFromMulter(files: Express.Multer.File[] | undefined): UploadedCataloguePhoto[] {
  return (files ?? []).map((file) => ({
    photo: file.originalname.replace(/\.[^.]+$/, ''),
    buffer: file.buffer,
    originalName: file.originalname,
  }));
}

export async function saveCatalogueProduct(input: {
  catalogue: AdminCatalogue;
  document: CatalogueDocument;
  uploads: UploadedCataloguePhoto[];
  update: boolean;
  req: Request;
}): Promise<{ productUid: string; created: boolean; changes: string[] }> {
  if (!input.update && isBlankProductUid(input.document['product-uid'])) {
    input.document['product-uid'] = await allocateShopProductUid();
  }
  const body = documentToImportBody(input.catalogue, input.document, { update: input.update });
  const productUid = body.productUid as string;
  const expectedType = catalogueProductType(input.catalogue);
  const existingId = await findProductIdByProductUid(pool, productUid);

  if (input.update) {
    if (!existingId) throw new CatalogueDocumentError(`Product ${productUid} was not found.`);
    const { rows } = await pool.query<{ product_type: string; audience: string }>(
      `select product_type, audience from products where id = $1`,
      [existingId],
    );
    const row = rows[0];
    if (!row || row.product_type !== expectedType) {
      throw new CatalogueDocumentError(`Product ${productUid} was not found in this catalogue.`);
    }
    if (input.catalogue === 'user-library' && row.audience !== 'user-library') {
      throw new CatalogueDocumentError(`Product ${productUid} was not found in this catalogue.`);
    }
    if (input.catalogue === 'library' && row.audience !== 'public') {
      throw new CatalogueDocumentError(`Product ${productUid} was not found in this catalogue.`);
    }
  } else if (existingId) {
    throw new CatalogueDocumentError(`Product ${productUid} already exists.`);
  }

  let result;
  try {
    result = await importLibrarySet(body);
  } catch (error) {
    if (error instanceof InvalidLibrarySet) throw new CatalogueDocumentError(error.message);
    throw error;
  }

  const slots = extractPhotoSlots(input.catalogue, input.document);
  const photoStats = await reconcileCataloguePhotos(pool, result.id, slots, input.uploads);
  const changes = [
    ...result.changes,
    ...(photoStats.uploaded > 0 || photoStats.removed > 0 || photoStats.kept >= 0
      ? photoStats.uploaded > 0 || photoStats.removed > 0
        ? ['photos']
        : []
      : []),
  ];

  await recordAdminActivity(pool, input.req.user!, {
    category: 'catalogue',
    action: input.update ? 'catalogue.product.update' : 'catalogue.product.create',
    summary: input.update
      ? `Produit ${productUid}: ${changes.length ? changes.join(', ') : 'aucun changement'}`
      : `Produit ${productUid}: créé`,
    targetType: 'product',
    targetId: productUid,
    detail: {
      catalogue: input.catalogue,
      changes,
      photos: photoStats,
    },
  });

  return { productUid, created: result.created, changes };
}

export async function deleteCatalogueProduct(input: {
  catalogue: AdminCatalogue;
  productUid: string;
  req: Request;
}): Promise<boolean> {
  const expectedType = catalogueProductType(input.catalogue);
  const existingId = await findProductIdByProductUid(pool, input.productUid);
  if (!existingId) return false;
  const { rows } = await pool.query<{ product_type: string; audience: string }>(
    `select product_type, audience from products where id = $1`,
    [existingId],
  );
  const row = rows[0];
  if (!row || row.product_type !== expectedType) return false;
  if (input.catalogue === 'user-library' && row.audience !== 'user-library') return false;
  if (input.catalogue === 'library' && row.audience !== 'public') return false;

  await deleteSet(pool, existingId);
  await recordAdminActivity(pool, input.req.user!, {
    category: 'catalogue',
    action: 'catalogue.product.delete',
    summary: `Produit ${input.productUid}: supprimé`,
    targetType: 'product',
    targetId: input.productUid,
    detail: { catalogue: input.catalogue },
  });
  return true;
}
