/** Admin vocabulary: library data-common by one entry, nail data-common by
 * one variation title or option. */
import { Router, type Request, type Response } from 'express';
import type { AuthenticatedUser } from '../../../types.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import {
  parseAxisPart,
  parseLengthPart,
  parseLibraryPart,
  parseShapePart,
  parseTranslationPart,
  parseVocabularyKey,
  VocabularyEditError,
} from '../domain/catalogueVocabulary.js';
import {
  deleteColor,
  deleteLength,
  deleteNailAxis,
  deleteNailOption,
  deleteShape,
  listCatalogueVocabulary,
  readColor,
  readLength,
  readNailAxis,
  readNailOption,
  readShape,
  writeColor,
  writeLength,
  writeNailAxis,
  writeNailOption,
  writeShape,
} from './catalogueVocabularySupport.js';

export const adminCatalogueVocabularyRouter = Router();

const gate = [requireAuth, requirePermission('catalogue_edit')] as const;

function fail(res: Response, error: unknown): boolean {
  if (!(error instanceof VocabularyEditError)) return false;
  const code = error.status === 404 ? 'not_found' : error.status === 409 ? 'conflict' : 'invalid_request';
  res.status(error.status).json({ success: false, error: { code, message: error.message } });
  return true;
}

function userOf(req: Request): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

function keyParam(req: Request, name: string): string {
  const raw = typeof req.params[name] === 'string' ? req.params[name] : '';
  return parseVocabularyKey(raw);
}

function documentBody(req: Request): unknown {
  const body = req.body as { document?: unknown } | null;
  if (!body || typeof body !== 'object' || !('document' in body)) {
    throw new VocabularyEditError(400, 'document is required.');
  }
  return body.document;
}

adminCatalogueVocabularyRouter.get('/catalogue-vocabulary', ...gate, async (_req, res) => {
  res.json({ success: true, ...(await listCatalogueVocabulary()) });
});

adminCatalogueVocabularyRouter.get('/catalogue-vocabulary/library/:part/:key', ...gate, async (req, res) => {
  try {
    const part = parseLibraryPart(typeof req.params.part === 'string' ? req.params.part : '');
    const key = keyParam(req, 'key');
    const document =
      part === 'shape' ? await readShape(key) : part === 'length' ? await readLength(key) : await readColor(key);
    res.json({ success: true, document });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});

adminCatalogueVocabularyRouter.put('/catalogue-vocabulary/library/:part/:key', ...gate, async (req, res) => {
  try {
    const part = parseLibraryPart(typeof req.params.part === 'string' ? req.params.part : '');
    const key = keyParam(req, 'key');
    const raw = documentBody(req);
    const user = userOf(req);
    const result =
      part === 'shape'
        ? await writeShape(user, key, parseShapePart(raw))
        : part === 'length'
          ? await writeLength(user, key, parseLengthPart(raw))
          : await writeColor(user, key, parseTranslationPart(raw));
    res.json({ success: true, created: result.created });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});

adminCatalogueVocabularyRouter.delete('/catalogue-vocabulary/library/:part/:key', ...gate, async (req, res) => {
  try {
    const part = parseLibraryPart(typeof req.params.part === 'string' ? req.params.part : '');
    const key = keyParam(req, 'key');
    const user = userOf(req);
    const deleted =
      part === 'shape'
        ? await deleteShape(user, key)
        : part === 'length'
          ? await deleteLength(user, key)
          : await deleteColor(user, key);
    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'not_found', message: 'Not found.' } });
      return;
    }
    res.json({ success: true, deleted: true });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});

adminCatalogueVocabularyRouter.get('/catalogue-vocabulary/nail/:axis', ...gate, async (req, res) => {
  try {
    res.json({ success: true, document: await readNailAxis(keyParam(req, 'axis')) });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});

adminCatalogueVocabularyRouter.put('/catalogue-vocabulary/nail/:axis', ...gate, async (req, res) => {
  try {
    const axis = keyParam(req, 'axis');
    const result = await writeNailAxis(userOf(req), axis, parseAxisPart(documentBody(req)));
    res.json({ success: true, created: result.created });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});

adminCatalogueVocabularyRouter.delete('/catalogue-vocabulary/nail/:axis', ...gate, async (req, res) => {
  try {
    const deleted = await deleteNailAxis(userOf(req), keyParam(req, 'axis'));
    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'not_found', message: 'Not found.' } });
      return;
    }
    res.json({ success: true, deleted: true });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});

adminCatalogueVocabularyRouter.get('/catalogue-vocabulary/nail/:axis/:option', ...gate, async (req, res) => {
  try {
    res.json({ success: true, document: await readNailOption(keyParam(req, 'axis'), keyParam(req, 'option')) });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});

adminCatalogueVocabularyRouter.put('/catalogue-vocabulary/nail/:axis/:option', ...gate, async (req, res) => {
  try {
    const result = await writeNailOption(
      userOf(req),
      keyParam(req, 'axis'),
      keyParam(req, 'option'),
      parseTranslationPart(documentBody(req)),
    );
    res.json({ success: true, created: result.created });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});

adminCatalogueVocabularyRouter.delete('/catalogue-vocabulary/nail/:axis/:option', ...gate, async (req, res) => {
  try {
    const deleted = await deleteNailOption(userOf(req), keyParam(req, 'axis'), keyParam(req, 'option'));
    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'not_found', message: 'Not found.' } });
      return;
    }
    res.json({ success: true, deleted: true });
  } catch (error) {
    if (fail(res, error)) return;
    throw error;
  }
});
