import { Router } from 'express';
import { config } from '../../../config/env.js';
import { isPositiveIntegerAtMost } from '../../../utils/fieldLimits.js';
import { isUuid } from '../../../utils/validate.js';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requestLanguage } from '../../../utils/language.js';
import * as composition from '../application/composition.js';

export const accountCompositionRouter = Router();

function mapCompositionError(error: unknown, res: import('express').Response): boolean {
  if (!(error instanceof Error)) return false;
  const code = error.message;
  if (code === 'not_found') {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return true;
  }
  if (code === 'composition_editing') {
    res.status(409).json({ success: false, error: { code: 'composition_editing' } });
    return true;
  }
  if (
    code === 'empty' ||
    code === 'too_many' ||
    code === 'missing_finger' ||
    code === 'duplicate_finger' ||
    code === 'invalid_finger' ||
    code === 'invalid_size' ||
    code === 'unavailable' ||
    code === 'invalid_price' ||
    code === 'invalid_composition_product' ||
    code === 'price_missing' ||
    code === 'invalid_request'
  ) {
    res.status(400).json({ success: false, error: { code } });
    return true;
  }
  return false;
}

function parseCompositionBody(body: unknown): composition.CompositionWriteInput | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const size = typeof raw.size === 'string' ? raw.size : '';
  const quantity = typeof raw.quantity === 'number' ? raw.quantity : 1;
  // Same ceiling as the guest and gift composition routes; an uncapped value
  // overflowed the integer column as a 500.
  if (!isPositiveIntegerAtMost(quantity, config.fieldLimits.cartQuantityMax)) return null;
  if (!Array.isArray(raw.nails)) return null;
  const nails: composition.CompositionNailWrite[] = [];
  for (const entry of raw.nails) {
    if (!entry || typeof entry !== 'object') return null;
    const nail = entry as Record<string, unknown>;
    if (
      !isUuid(nail.productId) ||
      typeof nail.shapeKey !== 'string' ||
      typeof nail.lengthKey !== 'string' ||
      typeof nail.finger !== 'string'
    ) {
      return null;
    }
    nails.push({
      productId: nail.productId,
      shapeKey: nail.shapeKey,
      lengthKey: nail.lengthKey,
      finger: nail.finger,
      variationKey: typeof nail.variationKey === 'string' ? nail.variationKey : '',
    });
  }
  return { size, quantity, nails };
}

accountCompositionRouter.post('/cart/compositions', requireAuth, async (req, res) => {
  const input = parseCompositionBody(req.body);
  if (!input) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const created = await composition.createComposition(pool, req.user!.id, input, requestLanguage(req));
    res.status(201).json({ success: true, composition: created });
  } catch (error) {
    if (mapCompositionError(error, res)) return;
    throw error;
  }
});

accountCompositionRouter.put('/cart/compositions/:id', requireAuth, async (req, res) => {
  const input = parseCompositionBody(req.body);
  const compositionId = isUuid(req.params.id) ? req.params.id : '';
  if (!input || !compositionId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const updated = await composition.replaceComposition(
      pool,
      req.user!.id,
      compositionId,
      input,
      requestLanguage(req),
      { clearEditing: req.body?.clearEditing === true },
    );
    res.json({ success: true, composition: updated });
  } catch (error) {
    if (mapCompositionError(error, res)) return;
    throw error;
  }
});

accountCompositionRouter.delete('/cart/compositions/:id', requireAuth, async (req, res) => {
  const compositionId = isUuid(req.params.id) ? req.params.id : '';
  if (!compositionId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    await composition.deleteComposition(pool, req.user!.id, compositionId);
    res.json({ success: true });
  } catch (error) {
    if (mapCompositionError(error, res)) return;
    throw error;
  }
});

accountCompositionRouter.post('/cart/compositions/:id/edit', requireAuth, async (req, res) => {
  const compositionId = isUuid(req.params.id) ? req.params.id : '';
  if (!compositionId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const updated = await composition.startCompositionEdit(
      pool,
      req.user!.id,
      compositionId,
      requestLanguage(req),
    );
    res.json({ success: true, composition: updated });
  } catch (error) {
    if (mapCompositionError(error, res)) return;
    throw error;
  }
});

accountCompositionRouter.post('/cart/compositions/:id/cancel-edit', requireAuth, async (req, res) => {
  const compositionId = isUuid(req.params.id) ? req.params.id : '';
  if (!compositionId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const updated = await composition.cancelCompositionEdit(
      pool,
      req.user!.id,
      compositionId,
      requestLanguage(req),
    );
    res.json({ success: true, composition: updated });
  } catch (error) {
    if (mapCompositionError(error, res)) return;
    throw error;
  }
});

accountCompositionRouter.post('/cart/compositions/:id/move-to-wishlist', requireAuth, async (req, res) => {
  const compositionId = isUuid(req.params.id) ? req.params.id : '';
  if (!compositionId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    await composition.moveCompositionToWishlist(pool, req.user!.id, compositionId);
    res.json({ success: true });
  } catch (error) {
    if (mapCompositionError(error, res)) return;
    throw error;
  }
});
