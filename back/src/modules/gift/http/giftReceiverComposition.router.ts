import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { isPositiveIntegerAtMost } from '../../../utils/fieldLimits.js';
import { requestLanguage } from '../../../utils/language.js';
import { isNonEmptyString } from '../../../utils/validate.js';
import type { CompositionWriteInput } from '../../cart/application/composition.js';
import { loadReceiverOffer } from '../application/loadOffer.js';
import {
  deleteReceiverComposition,
  listReceiverCompositions,
  putReceiverComposition,
} from '../application/receiverComposition.js';
import { rawPathToken, withGiftErrors } from './giftErrors.js';

export const giftReceiverCompositionRouter = Router();

const COMPOSITION_FINGERS = new Set([
  'left-thumb',
  'left-index',
  'left-middle',
  'left-ring',
  'left-pinky',
  'right-thumb',
  'right-index',
  'right-middle',
  'right-ring',
  'right-pinky',
]);

function parseGiftCompositionBody(body: unknown): CompositionWriteInput | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  const size = typeof row.size === 'string' ? row.size : '';
  const quantity = isPositiveIntegerAtMost(row.quantity, config.fieldLimits.cartQuantityMax)
    ? row.quantity
    : undefined;
  if (!size || quantity === undefined || !Array.isArray(row.nails) || row.nails.length === 0) {
    return null;
  }
  const nails: CompositionWriteInput['nails'] = [];
  for (const nailRaw of row.nails) {
    if (!nailRaw || typeof nailRaw !== 'object') return null;
    const nail = nailRaw as Record<string, unknown>;
    const productId = isNonEmptyString(nail.productId) ? nail.productId : undefined;
    const shapeKey = typeof nail.shapeKey === 'string' ? nail.shapeKey : '';
    const lengthKey = typeof nail.lengthKey === 'string' ? nail.lengthKey : '';
    const finger = typeof nail.finger === 'string' ? nail.finger : '';
    const variationKey = typeof nail.variationKey === 'string' ? nail.variationKey : '';
    if (!productId || !shapeKey || !lengthKey || !COMPOSITION_FINGERS.has(finger)) return null;
    nails.push({ productId, shapeKey, lengthKey, finger, variationKey });
  }
  return { size, quantity, nails };
}

giftReceiverCompositionRouter.get('/:token/compositions', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const compositions = await listReceiverCompositions(pool, offer, requestLanguage(req));
    res.json({ success: true, compositions });
  });
});

giftReceiverCompositionRouter.post('/:token/compositions', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    const input = parseGiftCompositionBody(req.body);
    if (!token || !input) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const composition = await putReceiverComposition(pool, offer, input, requestLanguage(req));
    res.status(201).json({ success: true, composition });
  });
});

giftReceiverCompositionRouter.put('/:token/compositions/:id', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    const compositionId = typeof req.params.id === 'string' ? req.params.id : '';
    const input = parseGiftCompositionBody(req.body);
    if (!token || !compositionId || !input) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const composition = await putReceiverComposition(pool, offer, input, requestLanguage(req), compositionId);
    res.json({ success: true, composition });
  });
});

giftReceiverCompositionRouter.delete('/:token/compositions/:id', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    const compositionId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!token || !compositionId) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    await deleteReceiverComposition(pool, offer, compositionId);
    res.json({ success: true });
  });
});
