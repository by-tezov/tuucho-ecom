import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import * as cart from '../application/cart.js';
import type { CartItemRow } from '../application/cart.js';
import { getProductsByIds } from '../../catalog/application/products.js';
import { isPositiveIntegerAtMost } from '../../../utils/fieldLimits.js';
import { requestLanguage } from '../../../utils/language.js';
import { isNonEmptyString, isUuid } from '../../../utils/validate.js';
import { notifyCartAbandoned } from '../application/cartAbandonment.js';
import {
  defaultLengthFor,
  isValidSize,
  productOffersShapeLength,
  resolveAccessoryPackKey,
  resolveCartLinesForUser,
  userCanAccessProduct,
} from '../../catalog/application/productCartQueries.js';
import { mapCartVariantParam, publicCartFor, toPublicCartItem } from './cartPresenter.js';
import { syncGiftHoldAfterLineChange } from './giftHoldAfterCartChange.js';
import { applyFilters } from '../../plugins/application/hooks.js';

export const accountActiveCartRouter = Router();

/** URL path sentinel for empty accessory variant path segments. */

accountActiveCartRouter.get('/cart', requireAuth, async (req, res) => {
  const language = requestLanguage(req);
  const rows = await cart.listForUser(pool, req.user!.id);
  const items = rows.map(toPublicCartItem);
  const payload: Record<string, unknown> = { success: true, items };
  if (req.query.expand === 'products') {
    const productIds = [...new Set(rows.map((row) => row.product_id))];
    payload.products = await getProductsByIds(pool, config.publicMediaUrl, productIds, language, req.user!.id);
  }
  res.json(
    await applyFilters('cart.view', payload, { client: pool, userId: req.user!.id, language }),
  );
});

/** Upsert — adds a new line, or on an existing line for this exact
 * (set, shape, length, size), adds `quantity` on top (natural "add to cart"
 * repeat-click behavior). A different shape, length or size is a different
 * line — see cart.service.ts.
 *
 * Nails: body `{ productId, shapeKey, size, quantity }`, plus an optional
 * `lengthKey` — omitted, it resolves to the shape's first length, which is
 * what every client sends today since no UI exposes length.
 * Accessories: body `{ productId, quantity, packKey? }`. Shape/length/size
 * are forced to ''. byQuantity accessories require a known `packKey`; default
 * accessories ignore it. */
accountActiveCartRouter.post('/cart', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const productId = isNonEmptyString(body.productId) ? body.productId : undefined;
  const quantity =
    body.quantity === undefined
      ? 1
      : isPositiveIntegerAtMost(body.quantity, config.fieldLimits.cartQuantityMax)
        ? body.quantity
        : undefined;
  if (!productId || quantity === undefined) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (!isUuid(productId) || !(await userCanAccessProduct(pool, req.user!.id, productId))) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }

  const { shapeKey, lengthKey, size, packKey } = body;
  const [variant] = await resolveCartLinesForUser(pool, req.user!.id, [
    { productId, shapeKey, lengthKey, size, packKey },
  ]);
  if (!variant) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  // Adding to cart always succeeds, regardless of stock — availability only
  // gates editing an existing line (PATCH below) and checkout, never the
  // initial add.
  try {
    await cart.addOrIncrement(
      pool,
      req.user!.id,
      productId,
      variant.shapeKey,
      variant.lengthKey,
      variant.size,
      quantity,
      variant.packKey,
    );
  } catch (error) {
    if (error instanceof cart.CartLineLockedError) {
      res.status(409).json({ success: false, error: { code: 'line_locked' } });
      return;
    }
    // Foreign-key violation: shapeKey isn't actually offered by this set (or
    // the set doesn't exist) — same handling as favorites' upsert.
    const code = (error as { code?: string }).code;
    if (code === '23503') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    throw error;
  }
  if (!(await syncGiftHoldAfterLineChange(pool, res, req.user!.id))) return;
  res.json({ success: true });
});

/** Line identity is product + shape + length + size. Quantity-only PATCH is
 * the stepper. A new shape/length/size body moves the line (optional quantity
 * override). Availability is informational until checkout. Accessories use
 * path `-` for empty variant fields; `{ packKey }` changes a byQuantity pack. */
accountActiveCartRouter.patch(
  '/cart/:productId/:shapeKey/:lengthKey/:size',
  requireAuth,
  async (req, res) => {
    const {
      productId,
      shapeKey: rawShapeKey,
      lengthKey: rawLengthKey,
      size: rawSize,
    } = req.params as {
      productId: string;
      shapeKey: string;
      lengthKey: string;
      size: string;
    };
    const shapeKey = mapCartVariantParam(rawShapeKey);
    const lengthKey = mapCartVariantParam(rawLengthKey);
    const size = mapCartVariantParam(rawSize);
    const isAccessoryLine = shapeKey === '' && lengthKey === '' && size === '';
    if (
      !isNonEmptyString(productId) ||
      (!isAccessoryLine &&
        (!isNonEmptyString(shapeKey) || !isNonEmptyString(lengthKey) || !isValidSize(size)))
    ) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (!(await userCanAccessProduct(pool, req.user!.id, productId))) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const body = req.body ?? {};
    const changesSelection = 'shapeKey' in body || 'lengthKey' in body || 'size' in body;
    const changesPack = 'packKey' in body;

    if (changesPack) {
      if (!isAccessoryLine) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      const packKey = await resolveAccessoryPackKey(pool, productId, body.packKey);
      if (packKey === null) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      let row: CartItemRow | undefined;
      try {
        row = await cart.updateLinePackKey(pool, req.user!.id, productId, shapeKey, lengthKey, size, packKey);
      } catch (error) {
        if (error instanceof cart.CartLineLockedError) {
          res.status(409).json({ success: false, error: { code: 'line_locked' } });
          return;
        }
        throw error;
      }
      if (!row) {
        res.status(404).json({ success: false, error: { code: 'not_found' } });
        return;
      }
      if ('quantity' in body) {
        if (!isPositiveIntegerAtMost(body.quantity, config.fieldLimits.cartQuantityMax)) {
          res.status(400).json({ success: false, error: { code: 'invalid_request' } });
          return;
        }
        try {
          row = await cart.updateLine(
            pool,
            req.user!.id,
            productId,
            shapeKey,
            lengthKey,
            size,
            body.quantity,
          );
        } catch (error) {
          if (error instanceof cart.CartLineLockedError) {
            res.status(409).json({ success: false, error: { code: 'line_locked' } });
            return;
          }
          throw error;
        }
        if (!row) {
          res.status(404).json({ success: false, error: { code: 'not_found' } });
          return;
        }
      }
      if (!(await syncGiftHoldAfterLineChange(pool, res, req.user!.id))) return;
      res.json({ success: true, item: toPublicCartItem(row) });
      return;
    }

    if (changesSelection) {
      if (isAccessoryLine) {
        // Accessories have no shape/length/size selection to change.
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      if ('shapeKey' in body && !isNonEmptyString(body.shapeKey)) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      if ('lengthKey' in body && !isNonEmptyString(body.lengthKey)) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      if ('size' in body && !isValidSize(body.size)) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      const toShapeKey = (body.shapeKey as string | undefined) ?? shapeKey;
      const toSize = (body.size as string | undefined) ?? size;
      // Changing shape without naming a length lands on the new shape's own
      // default, since the old length key may not exist under it at all.
      const toLengthKey =
        (body.lengthKey as string | undefined) ??
        (toShapeKey === shapeKey ? lengthKey : await defaultLengthFor(pool, productId, toShapeKey));
      if (!(await productOffersShapeLength(pool, productId, toShapeKey, toLengthKey))) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      // Optional: the cart's "Replace" picker lets the customer pick a
      // quantity for the new selection instead of just inheriting the old
      // line's — omitted, every other caller (shape change) keeps today's
      // carry-the-old-quantity behavior.
      let quantity: number | undefined;
      if ('quantity' in body) {
        if (!isPositiveIntegerAtMost(body.quantity, config.fieldLimits.cartQuantityMax)) {
          res.status(400).json({ success: false, error: { code: 'invalid_request' } });
          return;
        }
        quantity = body.quantity;
      }
      let row: CartItemRow | undefined;
      try {
        row = await cart.changeLineSelection(
          pool,
          req.user!.id,
          productId,
          shapeKey,
          lengthKey,
          size,
          toShapeKey,
          toLengthKey,
          toSize,
          quantity,
        );
      } catch (error) {
        if (error instanceof cart.CartLineLockedError) {
          res.status(409).json({ success: false, error: { code: 'line_locked' } });
          return;
        }
        const code = (error as { code?: string }).code;
        if (code === '23503') {
          res.status(400).json({ success: false, error: { code: 'invalid_request' } });
          return;
        }
        throw error;
      }
      if (!row) {
        res.status(404).json({ success: false, error: { code: 'not_found' } });
        return;
      }
      if (!(await syncGiftHoldAfterLineChange(pool, res, req.user!.id))) return;
      res.json({ success: true, item: toPublicCartItem(row) });
      return;
    }

    if (!isPositiveIntegerAtMost(body.quantity, config.fieldLimits.cartQuantityMax)) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    let row: CartItemRow | undefined;
    try {
      row = await cart.updateLine(pool, req.user!.id, productId, shapeKey, lengthKey, size, body.quantity);
    } catch (error) {
      if (error instanceof cart.CartLineLockedError) {
        res.status(409).json({ success: false, error: { code: 'line_locked' } });
        return;
      }
      throw error;
    }
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (!(await syncGiftHoldAfterLineChange(pool, res, req.user!.id))) return;
    res.json({ success: true, item: toPublicCartItem(row) });
  },
);

accountActiveCartRouter.delete(
  '/cart/:productId/:shapeKey/:lengthKey/:size',
  requireAuth,
  async (req, res) => {
    const {
      productId,
      shapeKey: rawShapeKey,
      lengthKey: rawLengthKey,
      size: rawSize,
    } = req.params as {
      productId: string;
      shapeKey: string;
      lengthKey: string;
      size: string;
    };
    const shapeKey = mapCartVariantParam(rawShapeKey);
    const lengthKey = mapCartVariantParam(rawLengthKey);
    const size = mapCartVariantParam(rawSize);
    let removedLine: CartItemRow | undefined;
    try {
      removedLine = await cart.remove(pool, req.user!.id, productId, shapeKey, lengthKey, size);
    } catch (error) {
      if (error instanceof cart.CartLineLockedError) {
        res.status(409).json({ success: false, error: { code: 'line_locked' } });
        return;
      }
      throw error;
    }
    if (removedLine) await notifyCartAbandoned(pool, req.user!.id, req.user!.email, removedLine);
    if (removedLine && !(await syncGiftHoldAfterLineChange(pool, res, req.user!.id))) return;
    res.json({ success: true, deleted: Boolean(removedLine) });
  },
);

accountActiveCartRouter.post('/cart/move-to-wishlist', requireAuth, async (req, res) => {
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!rawItems || rawItems.length === 0 || rawItems.length > config.fieldLimits.cartImportLinesMax) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const items: cart.CartLineIdentity[] = [];
  for (const raw of rawItems) {
    const productId = isNonEmptyString(raw?.productId) ? raw.productId : undefined;
    const shapeKey = typeof raw?.shapeKey === 'string' ? raw.shapeKey : undefined;
    const lengthKey = typeof raw?.lengthKey === 'string' ? raw.lengthKey : undefined;
    const size = typeof raw?.size === 'string' ? raw.size : undefined;
    const accessory = shapeKey === '' && lengthKey === '' && size === '';
    if (
      !productId ||
      shapeKey === undefined ||
      lengthKey === undefined ||
      size === undefined ||
      (!accessory && (!shapeKey || !lengthKey || !isValidSize(size)))
    ) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    items.push({ productId, shapeKey, lengthKey, size });
  }
  try {
    const result = await cart.moveToWishlist(pool, req.user!.id, items);
    res.json({
      success: true,
      moved: result.moved.map(toPublicCartItem),
      wishlist: await publicCartFor(pool, req.user!.id, result.wishlist.id, result.wishlist),
    });
  } catch (error) {
    if (error instanceof cart.CartLineLockedError) {
      res.status(409).json({ success: false, error: { code: 'line_locked' } });
      return;
    }
    if (error instanceof cart.CartNotFoundError) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (error instanceof Error && error.message === 'invalid_request') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    throw error;
  }
});
