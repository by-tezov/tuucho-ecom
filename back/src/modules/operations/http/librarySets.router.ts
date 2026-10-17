import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { pool } from '../../../db/pool.js';
import { deleteSet } from '../application/adminProducts.js';
import { addPhoto } from '../application/adminPhotos.js';
import { clearLibraryData, findProductIdByProductUid } from '../application/libraryImport.js';
import type { ProductType } from '../application/libraryImport.js';
import { listLibrarySets } from '../application/libraryList.js';

import {
  InvalidLibrarySet,
  importLibrarySet,
  mapVariantParam,
  type LibraryImportResult,
} from '../application/librarySetImport.js';

export const librarySetsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function acceptPhotoUploads(req: Request, res: Response, next: NextFunction): void {
  upload.array('photos', 20)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message =
      err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE'
        ? `unexpected field "${err.field ?? ''}" (expected photos)`
        : err instanceof Error
          ? err.message
          : 'photo upload failed';
    res.status(400).json({ success: false, error: message });
  });
}

librarySetsRouter.post('/sets', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    res.json(await importLibrarySet(body));
  } catch (error) {
    if (error instanceof InvalidLibrarySet) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    throw error;
  }
});

/** Batch metadata import. The results are positionally aligned with `sets`;
 * photos remain on the bounded multipart endpoint below. */
librarySetsRouter.post('/sets/batch', async (req, res) => {
  const items = Array.isArray(req.body?.sets) ? (req.body.sets as unknown[]) : undefined;
  if (
    !items ||
    items.length === 0 ||
    items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const sets = items as Record<string, unknown>[];
  try {
    const results: LibraryImportResult[] = [];
    for (const set of sets) results.push(await importLibrarySet(set));
    res.json({ success: true, results });
  } catch (error) {
    if (error instanceof InvalidLibrarySet) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    throw error;
  }
});

/** Every photo arrives already at modal quality/size (see
 * adminPhotos.service.ts's addPhoto). The same bytes are stored as the
 * grid `small` file: sharp inside loopback opsServer aborts on CloudLinux.
 * Called after both `created:true` and `updated:true` from POST /sets
 * above — the latter just wiped this set's photo rows, so this starts
 * from position 1 again either way. Optional `hashes` JSON body field is
 * a string[] parallel to the uploaded files (SHA-256 of modal bytes from
 * prepare-library); mismatch rejects the upload. */
const uploadPhotos = async (req: Request, res: Response) => {
  const {
    id,
    shapeKey: rawShapeKey,
    lengthKey: rawLengthKey,
    variationKey = '',
  } = req.params as {
    id: string;
    shapeKey: string;
    lengthKey: string;
    variationKey?: string;
  };
  // Empty variant segments use the `-` sentinel. Default accessories store
  // photos at ''/''. byQuantity accessories store photos at shape_key = pack
  // key (x5, x10, …) and length_key ''.
  const shapeKey = mapVariantParam(rawShapeKey);
  const lengthKey = mapVariantParam(rawLengthKey);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let hashes: Array<string | null> = [];
  if (typeof req.body?.hashes === 'string' && req.body.hashes.length > 0) {
    try {
      const parsed = JSON.parse(req.body.hashes) as unknown;
      if (Array.isArray(parsed)) {
        hashes = parsed.map((value) => (typeof value === 'string' ? value : null));
      }
    } catch {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
  }

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      await addPhoto(pool, id, shapeKey, lengthKey, file.buffer, file.originalname, hashes[i] ?? null, variationKey);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'photo upload failed';
    res.status(400).json({ success: false, error: message });
    return;
  }

  res.json({ success: true, added: files.length });
};

librarySetsRouter.post('/sets/:id/shapes/:shapeKey/lengths/:lengthKey/photos', acceptPhotoUploads, uploadPhotos);

/** Same, for one variation option of a single nail
 * (`modal/<shape>/<length>/<variation>/` in pamsurin-manager). */
librarySetsRouter.post(
  '/sets/:id/shapes/:shapeKey/lengths/:lengthKey/variations/:variationKey/photos',
  acceptPhotoUploads,
  uploadPhotos,
);

/** Backs `library -- delete <target>` — a single set, resolved to its
 * product_uid client-side (see scripts/library.ts). Cascades to its shapes/
 * colors/photos rows (photo files on disk are left behind, see
 * adminPhotos.service.ts's deleteAllPhotosForSet). */
librarySetsRouter.delete('/sets/:productUid', async (req, res) => {
  const { productUid } = req.params as { productUid: string };
  const existingId = await findProductIdByProductUid(pool, productUid);
  if (!existingId) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await deleteSet(pool, existingId);
  res.json({ success: true, deleted: true });
});

/** Backs `library -- check` — a full snapshot of every set currently in the
 * DB, for the CLI to diff against pamsurin-manager's local library.
 * Optional `?productType=accessory` lists accessories instead of nails. */
librarySetsRouter.get('/sets', async (req, res) => {
  const productType: ProductType =
    req.query.productType === 'accessory'
      ? 'accessory'
      : req.query.productType === 'nail_single'
        ? 'nail_single'
        : 'nail';
  const audience =
    req.query.audience === 'user-library'
      ? 'user-library'
      : req.query.audience === 'public'
        ? 'public'
        : undefined;
  const sets = await listLibrarySets(pool, productType, audience);
  res.json({ success: true, sets });
});

librarySetsRouter.post('/clear', async (_req, res) => {
  const result = await clearLibraryData(pool);
  res.json({ success: true, ...result });
});
