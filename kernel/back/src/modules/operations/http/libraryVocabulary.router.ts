import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  deleteColor,
  deleteShape,
  listVocabulary,
  syncAccessoryQuantities,
  listAccessoryQuantities,
  syncVocabulary,
} from '../application/libraryImport.js';
import type {
  ShapeLengthVocabularyEntry,
  ShapeVocabularyEntry,
  VocabularyGender,
} from '../domain/vocabulary.js';
import type { PartialTrilingual } from '../../../types.js';

import { isPartialTrilingual } from '../application/librarySetImport.js';
import {
  parseVariationVocabulary,
  syncVariationVocabulary,
} from '../application/libraryVariationVocabulary.js';

export const libraryVocabularyRouter = Router();

libraryVocabularyRouter.post('/vocabulary', async (req, res) => {
  const rawShapes = req.body?.shapes;
  const rawColors = req.body?.colors;
  // A shape entry is `{ title, length: { <key>: { value, title } } }` — see
  // catalog source's data-common.json. An entry whose title isn't a valid
  // trilingual is dropped whole, same as before; a malformed individual
  // length is dropped on its own so one typo can't lose the shape.
  // `{ "fr": "f", "en": "" }` — anything that is not a string value is
  // dropped rather than rejecting the whole shape: a missing gender only
  // costs the unmarked agreement variant (see catalog/domain/productCopy.ts).
  const readGender = (raw: unknown): VocabularyGender => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        ([lang, value]) => lang.length > 0 && typeof value === 'string',
      ),
    ) as VocabularyGender;
  };
  const shapes: Record<string, ShapeVocabularyEntry> = {};
  for (const [key, entry] of Object.entries((rawShapes ?? {}) as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const {
      title,
      length,
      gender,
      attributive,
    } = entry as { title?: unknown; length?: unknown; gender?: unknown; attributive?: unknown };
    if (!isPartialTrilingual(title)) continue;
    const lengths: Record<string, ShapeLengthVocabularyEntry> = {};
    for (const [lengthKey, lengthEntry] of Object.entries((length ?? {}) as Record<string, unknown>)) {
      if (!lengthEntry || typeof lengthEntry !== 'object') continue;
      const {
        value,
        title: lengthTitle,
        gender: lengthGender,
      } = lengthEntry as { value?: unknown; title?: unknown; gender?: unknown };
      if (!isPartialTrilingual(lengthTitle)) continue;
      lengths[lengthKey] = {
        value: typeof value === 'string' ? value : '',
        title: lengthTitle,
        gender: readGender(lengthGender),
      };
    }
    shapes[key] = {
      title,
      length: lengths,
      gender: readGender(gender),
      ...(isPartialTrilingual(attributive) ? { attributive } : {}),
    };
  }
  const colors = Object.fromEntries(
    Object.entries((rawColors ?? {}) as Record<string, unknown>).filter(([, label]) =>
      isPartialTrilingual(label),
    ),
  ) as Record<string, PartialTrilingual>;
  const deleteMissing = req.body?.deleteMissing === true;
  const isCompleteMap = (raw: unknown, parsed: Record<string, unknown>) =>
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Object.keys(raw).every((key) => key.length > 0) &&
    Object.keys(raw).length === Object.keys(parsed).length;
  if (deleteMissing && (!isCompleteMap(rawShapes, shapes) || !isCompleteMap(rawColors, colors))) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const result = await syncVocabulary(pool, shapes, colors, deleteMissing);
  // Variation axes are only touched when the payload carries them: a
  // catalogue whose layered vocabulary has no `variation` table (sets today)
  // must not delete the single nails' axes with its deleteMissing run.
  const variations =
    req.body?.variations === undefined ? null : parseVariationVocabulary(req.body.variations, isPartialTrilingual);
  const variationResult = variations
    ? await syncVariationVocabulary(pool, variations, deleteMissing)
    : { variationAxes: 0, variationOptions: 0, deletedVariations: [] };
  res.json({ success: true, ...result, ...variationResult });
});

libraryVocabularyRouter.get('/vocabulary', async (_req, res) => {
  const vocabulary = await listVocabulary(pool);
  res.json({ success: true, ...vocabulary });
});

libraryVocabularyRouter.post('/accessory-vocabulary', async (req, res) => {
  const rawQuantities = req.body?.quantities;
  const quantities = Object.fromEntries(
    Object.entries((rawQuantities ?? {}) as Record<string, unknown>).filter(([, label]) =>
      isPartialTrilingual(label),
    ),
  ) as Record<string, PartialTrilingual>;
  const deleteMissing = req.body?.deleteMissing === true;
  const isCompleteMap =
    !!rawQuantities &&
    typeof rawQuantities === 'object' &&
    !Array.isArray(rawQuantities) &&
    Object.keys(rawQuantities).every((key) => key.length > 0) &&
    Object.keys(rawQuantities).length === Object.keys(quantities).length;
  if (deleteMissing && !isCompleteMap) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const result = await syncAccessoryQuantities(pool, quantities, deleteMissing);
  res.json({ success: true, ...result });
});

libraryVocabularyRouter.get('/accessory-vocabulary', async (_req, res) => {
  const vocabulary = await listAccessoryQuantities(pool);
  res.json({ success: true, ...vocabulary });
});

libraryVocabularyRouter.delete('/shapes/:key', async (req, res) => {
  const { key } = req.params as { key: string };
  if (!(await deleteShape(pool, key))) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, deleted: true });
});

libraryVocabularyRouter.delete('/colors/:key', async (req, res) => {
  const { key } = req.params as { key: string };
  if (!(await deleteColor(pool, key))) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, deleted: true });
});
