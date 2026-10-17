import { Router } from 'express';
import { isUuid } from '../../../utils/validate.js';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { lineCommentOrNull } from '../../../utils/fieldLimits.js';
import { isNonEmptyString } from '../../../utils/validate.js';
import * as cart from '../application/cart.js';
import * as composition from '../application/composition.js';

/** Customer notes on cart cards ("+ Ajouter un commentaire"). Checkout copies
 * them onto order_items.comment for the order page, admin and invoice. */
export const accountCartCommentRouter = Router();

/** Note on one cart card: every customer line of this product+shape+length
 * in the active cart (accessories: empty shape/length). Blank or null
 * clears it. */
accountCartCommentRouter.put('/cart/comment', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const productId = isNonEmptyString(body.productId) ? body.productId : undefined;
  const shapeKey = typeof body.shapeKey === 'string' ? body.shapeKey : undefined;
  const lengthKey = typeof body.lengthKey === 'string' ? body.lengthKey : undefined;
  const comment = lineCommentOrNull(body.comment);
  if (!productId || shapeKey === undefined || lengthKey === undefined || comment === undefined) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const updated = await cart.setCardComment(pool, req.user!.id, productId, shapeKey, lengthKey, comment);
  if (!updated) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, comment });
});

/** Note on one composed set (`{ comment }`, blank or null clears it). */
accountCartCommentRouter.put('/cart/compositions/:id/comment', requireAuth, async (req, res) => {
  const comment = lineCommentOrNull(req.body?.comment);
  if (comment === undefined) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (!isUuid(req.params.id)) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  try {
    await composition.setCompositionComment(pool, req.user!.id, String(req.params.id), comment);
  } catch (error) {
    if (error instanceof Error && error.message === 'not_found') {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    throw error;
  }
  res.json({ success: true, comment });
});
