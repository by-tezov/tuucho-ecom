/** Admin create / replace / delete for a full catalogue product (JSON + photos). */
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import {
  CatalogueDocumentError,
  cataloguePermission,
  emptyCatalogueTemplate,
  parseAdminCatalogue,
} from '../domain/catalogueDocument.js';
import {
  deleteCatalogueProduct,
  loadCatalogueProduct,
  parseDocumentField,
  saveCatalogueProduct,
  uploadsFromMulter,
} from './catalogueProductSupport.js';

export const adminCatalogueRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 40 },
});

function acceptDocumentUploads(req: Request, res: Response, next: NextFunction): void {
  upload.array('photos', 40)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message =
      err instanceof multer.MulterError
        ? err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `unexpected field "${err.field ?? ''}" (expected photos)`
          : err.message
        : err instanceof Error
          ? err.message
          : 'upload failed';
    res.status(400).json({ success: false, error: { code: 'invalid_request', message } });
  });
}

function catalogueFromParams(req: Request, res: Response): ReturnType<typeof parseAdminCatalogue> {
  const raw = typeof req.params.catalogue === 'string' ? req.params.catalogue : '';
  const catalogue = parseAdminCatalogue(raw);
  if (!catalogue) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return null;
  }
  return catalogue;
}

function documentError(res: Response, error: unknown): boolean {
  if (!(error instanceof CatalogueDocumentError)) return false;
  res.status(400).json({ success: false, error: { code: 'invalid_request', message: error.message } });
  return true;
}

/** Permission depends on :catalogue — resolve then gate. Named like
 * `requirePermission(…)` so the route inventory staff-gate check sees it. */
function requireCataloguePermission(req: Request, res: Response, next: NextFunction): void {
  const catalogue = catalogueFromParams(req, res);
  if (!catalogue) return;
  requirePermission(cataloguePermission(catalogue))(req, res, next);
}
Object.defineProperty(requireCataloguePermission, 'name', {
  value: 'requirePermission(library_stock/user_library_stock/nail_availability/accessory_stock)',
});

adminCatalogueRouter.get(
  '/catalogue/:catalogue/template',
  requireAuth,
  requireCataloguePermission,
  requirePermission('catalogue_edit'),
  (req, res) => {
    const catalogue = catalogueFromParams(req, res);
    if (!catalogue) return;
    res.json({ success: true, document: emptyCatalogueTemplate(catalogue) });
  },
);

adminCatalogueRouter.get(
  '/catalogue/:catalogue/:productUid',
  requireAuth,
  requireCataloguePermission,
  requirePermission('catalogue_edit'),
  async (req, res) => {
    const catalogue = catalogueFromParams(req, res);
    if (!catalogue) return;
    const productUid = typeof req.params.productUid === 'string' ? req.params.productUid.trim() : '';
    if (!productUid) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const loaded = await loadCatalogueProduct(catalogue, productUid);
    if (!loaded) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, document: loaded.document, photos: loaded.photos });
  },
);

adminCatalogueRouter.post(
  '/catalogue/:catalogue',
  requireAuth,
  requireCataloguePermission,
  requirePermission('catalogue_edit'),
  acceptDocumentUploads,
  async (req, res) => {
    const catalogue = catalogueFromParams(req, res);
    if (!catalogue) return;
    try {
      const document = parseDocumentField(req.body?.document);
      const result = await saveCatalogueProduct({
        catalogue,
        document,
        uploads: uploadsFromMulter(req.files as Express.Multer.File[] | undefined),
        update: false,
        req,
      });
      res.json({ success: true, ...result });
    } catch (error) {
      if (documentError(res, error)) return;
      throw error;
    }
  },
);

adminCatalogueRouter.put(
  '/catalogue/:catalogue/:productUid',
  requireAuth,
  requireCataloguePermission,
  requirePermission('catalogue_edit'),
  acceptDocumentUploads,
  async (req, res) => {
    const catalogue = catalogueFromParams(req, res);
    if (!catalogue) return;
    const productUid = typeof req.params.productUid === 'string' ? req.params.productUid.trim() : '';
    try {
      const document = parseDocumentField(req.body?.document);
      const docUid =
        typeof document['product-uid'] === 'string' ? document['product-uid'].trim().toUpperCase() : '';
      if (!productUid || docUid !== productUid.toUpperCase()) {
        res.status(400).json({
          success: false,
          error: { code: 'invalid_request', message: 'product-uid must match the URL.' },
        });
        return;
      }
      const result = await saveCatalogueProduct({
        catalogue,
        document,
        uploads: uploadsFromMulter(req.files as Express.Multer.File[] | undefined),
        update: true,
        req,
      });
      res.json({ success: true, ...result });
    } catch (error) {
      if (documentError(res, error)) return;
      throw error;
    }
  },
);

adminCatalogueRouter.delete(
  '/catalogue/:catalogue/:productUid',
  requireAuth,
  requireCataloguePermission,
  requirePermission('catalogue_edit'),
  async (req, res) => {
    const catalogue = catalogueFromParams(req, res);
    if (!catalogue) return;
    const productUid = typeof req.params.productUid === 'string' ? req.params.productUid.trim() : '';
    if (!productUid) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const deleted = await deleteCatalogueProduct({ catalogue, productUid, req });
    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, deleted: true });
  },
);
