import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import * as cart from '../application/cart.js';
import { listCartsForAccount } from '../application/ensureParkedDefaultCart.js';
import type { CartItemRow } from '../application/cart.js';
import * as guestImport from '../application/cartGuestImport.js';
import * as cartRebuy from '../application/cartRebuy.js';
import { boundedToken, boundedVoucherCode, lineCommentOrNull } from '../../../utils/fieldLimits.js';
import { isNonEmptyString } from '../../../utils/validate.js';
import { resolveCartLinesForUser, type RawCartLine } from '../../catalog/application/productCartQueries.js';
import { publicCartFor, toPublicCart, toPublicCartItem } from './cartPresenter.js';
import { parseGuestCompositions, readOrderCompositions } from './compositionRequest.js';
import { listPublicGiftCartMetaByCartId } from '../../gift/application/giverCartMeta.js';

export const accountCartsRouter = Router();

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

accountCartsRouter.get('/carts', requireAuth, async (req, res) => {
  const [rows, giftByCart] = await Promise.all([
    listCartsForAccount(pool, req.user!.id),
    listPublicGiftCartMetaByCartId(pool, req.user!.id),
  ]);
  const carts = rows
    .filter((row) => row.kind !== 'gift' || giftByCart.has(row.id))
    .map((row) => {
      const gift = giftByCart.get(row.id);
      return gift ? { ...toPublicCart(row), gift } : toPublicCart(row);
    });
  res.json({ success: true, carts, cartLimit: config.cartMaxPerUser });
});

accountCartsRouter.post('/carts', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const name = isNonEmptyString(body.name) ? body.name : undefined;
  const activate = body.activate !== false;
  try {
    const row = await cart.createCart(pool, req.user!.id, { name, activate });
    res.json({ success: true, cart: await publicCartFor(pool, req.user!.id, row.id, row) });
  } catch (error) {
    if (error instanceof cart.CartLimitError) {
      res.status(409).json({ success: false, error: { code: 'cart_limit_exceeded' } });
      return;
    }
    if (error instanceof Error && error.message === 'invalid_name') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    throw error;
  }
});

accountCartsRouter.post('/carts/rebuy', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const orderId = isNonEmptyString(body.orderId) ? body.orderId : undefined;
  const mode = body.mode === 'new' || body.mode === 'merge' ? body.mode : undefined;
  const targetCartId = isNonEmptyString(body.targetCartId) ? body.targetCartId : undefined;
  if (!orderId || !mode || (mode === 'merge' && !targetCartId)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const { rows: orderRows } = await pool.query<{ id: string; order_number: string; status: string }>(
    `select id, order_number, status from orders where id = $1 and user_id = $2`,
    [orderId, req.user!.id],
  );
  const order = orderRows[0];
  if (!order) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (order.status !== 'received' && order.status !== 'cancelled') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const { rows: itemRows } = await pool.query<CartItemRow>(
    `select product_id, shape_key, length_key, size, pack_key, quantity, comment
     from order_items
     where order_id = $1 and product_id is not null and product_type in ('nail', 'accessory')`,
    [orderId],
  );
  const compositions = await readOrderCompositions(pool, orderId);
  if (itemRows.length === 0 && compositions.length === 0) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  try {
    const result = await cartRebuy.rebuyFromOrder(
      pool,
      req.user!.id,
      orderId,
      mode,
      targetCartId,
      order.order_number,
      itemRows,
      compositions,
    );
    res.json({
      success: true,
      cartId: result.cartId,
      snapshotToken: result.snapshotToken,
      items: result.addedLines.map(toPublicCartItem),
    });
  } catch (error) {
    if (error instanceof cart.CartLimitError) {
      res.status(409).json({ success: false, error: { code: 'cart_limit_exceeded' } });
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

accountCartsRouter.post('/carts/rebuy/cancel', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const snapshotToken = boundedToken(body.snapshotToken);
  if (!snapshotToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    await cartRebuy.cancelRebuy(pool, req.user!.id, snapshotToken);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_or_expired_token') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    throw error;
  }
});

accountCartsRouter.post('/carts/import-guest', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const mode: guestImport.GuestImportMode | undefined =
    body.mode === 'new' || body.mode === 'merge' || body.mode === 'unconnected' ? body.mode : undefined;
  const targetCartId = isNonEmptyString(body.targetCartId) ? body.targetCartId : undefined;
  const name = isNonEmptyString(body.name) ? body.name : undefined;
  if (!mode || (mode === 'merge' && !targetCartId) || !Array.isArray(body.items)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const items: guestImport.GuestImportLine[] = [];
  // A guest cart is persisted in the browser and the catalogue can change
  // before its owner signs in. An item whose product, variant or accessory
  // pack no longer exists is stale state, not a reason to block the whole
  // sign-in/cart-choice flow: retain every line that still resolves and drop
  // only those stale lines. Bound the work as usual even if storage was
  // malformed or came from an older client with a larger cart.
  const rawLines: Array<RawCartLine & { productId: string; quantity: number; comment: unknown }> = [];
  for (const raw of (body.items as unknown[]).slice(0, config.fieldLimits.cartImportLinesMax)) {
    if (!raw || typeof raw !== 'object') continue;
    const line = raw as Record<string, unknown>;
    if (!isNonEmptyString(line.productId) || !isPositiveInteger(line.quantity)) continue;
    // Same ceiling as POST /account/cart; an older or tampered guest cart is
    // clamped rather than dropped.
    rawLines.push({
      productId: line.productId,
      shapeKey: line.shapeKey,
      lengthKey: line.lengthKey,
      size: line.size,
      packKey: line.packKey,
      comment: line.comment,
      quantity: Math.min(line.quantity, config.fieldLimits.cartQuantityMax),
    });
  }
  // Same product checks as POST /account/cart (variant, pack, and the
  // product's audience: a private library product of another customer never
  // resolves), batched into two queries for the whole cart.
  const resolved = await resolveCartLinesForUser(pool, req.user!.id, rawLines);
  rawLines.forEach((line, index) => {
    const variant = resolved[index];
    if (!variant) return;
    items.push({
      productId: line.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
      packKey: variant.packKey,
      quantity: line.quantity,
      comment: lineCommentOrNull(line.comment) ?? null,
    });
  });

  const compositions = parseGuestCompositions(body.compositions);

  const selectionRaw =
    body.selection && typeof body.selection === 'object' ? (body.selection as Record<string, unknown>) : {};
  // Address and payment-method ids are dropped unless they are this user's,
  // same as setCheckoutSelection.
  const ownedSelection = await cart.ownedSelectionIds(pool, req.user!.id, {
    addressId: isNonEmptyString(selectionRaw.addressId) ? selectionRaw.addressId : null,
    billingAddressId: isNonEmptyString(selectionRaw.billingAddressId) ? selectionRaw.billingAddressId : null,
    paymentMethodId: boundedToken(selectionRaw.paymentMethodId) ?? null,
  });
  const selection: guestImport.GuestImportSelection = {
    ...ownedSelection,
    sameAsBilling: selectionRaw.sameAsBilling !== false,
    courierCode: isNonEmptyString(selectionRaw.courierCode) ? selectionRaw.courierCode : null,
    express: selectionRaw.express === true,
    voucherCode: boundedVoucherCode(selectionRaw.voucherCode) ?? null,
  };

  try {
    const row = name
      ? await guestImport.importGuestCart(
          pool,
          req.user!.id,
          mode,
          targetCartId,
          items,
          selection,
          name,
          compositions,
        )
      : await guestImport.importGuestCart(
          pool,
          req.user!.id,
          mode,
          targetCartId,
          items,
          selection,
          undefined,
          compositions,
        );
    res.json({ success: true, cart: await publicCartFor(pool, req.user!.id, row.id, row) });
  } catch (error) {
    if (error instanceof cart.CartLimitError) {
      res.status(409).json({ success: false, error: { code: 'cart_limit_exceeded' } });
      return;
    }
    if (error instanceof cart.CartNotFoundError) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (error instanceof Error && (error.message === 'invalid_request' || error.message === 'invalid_name')) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    throw error;
  }
});

accountCartsRouter.patch('/carts/:cartId', requireAuth, async (req, res) => {
  const { cartId } = req.params as { cartId: string };
  const body = req.body ?? {};
  const name = isNonEmptyString(body.name) ? body.name : undefined;
  if (!name) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const row = await cart.renameCart(pool, req.user!.id, cartId, name);
    res.json({ success: true, cart: await publicCartFor(pool, req.user!.id, row.id, row) });
  } catch (error) {
    if (error instanceof cart.CartNotFoundError) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (error instanceof Error && (error.message === 'invalid_name' || error.message === 'invalid_request')) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    throw error;
  }
});

accountCartsRouter.post('/carts/:cartId/activate', requireAuth, async (req, res) => {
  const { cartId } = req.params as { cartId: string };
  try {
    const row = await cart.activateCart(pool, req.user!.id, cartId);
    res.json({ success: true, cart: await publicCartFor(pool, req.user!.id, row.id, row) });
  } catch (error) {
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

accountCartsRouter.post('/carts/:cartId/merge', requireAuth, async (req, res) => {
  const { cartId } = req.params as { cartId: string };
  const body = req.body ?? {};
  const sourceCartId = isNonEmptyString(body.sourceCartId) ? body.sourceCartId : undefined;
  if (!sourceCartId) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const row = await cart.mergeCarts(pool, req.user!.id, cartId, sourceCartId);
    res.json({ success: true, cart: await publicCartFor(pool, req.user!.id, row.id, row) });
  } catch (error) {
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

accountCartsRouter.delete('/carts/:cartId', requireAuth, async (req, res) => {
  const { cartId } = req.params as { cartId: string };
  try {
    await cart.deleteCart(pool, req.user!.id, cartId);
    res.json({ success: true });
  } catch (error) {
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

/** Cart lines. `?expand=products` additionally returns the catalogue data for
 * every product referenced by a line, in the exact shape GET /gallery/products
 * returns it — the client had to make that second call on every cart render
 * otherwise, since a line carries only ids. Without the parameter the response
 * is byte-for-byte what it always was. */
