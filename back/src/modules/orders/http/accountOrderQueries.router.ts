import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import * as couriers from '../../delivery/application/couriers.js';
import * as orders from '../application/ordersFacade.js';
import { getOrderTracking, ShippingTrackingError } from '../application/tracking/shippingTracking.js';
import { requestLanguage } from '../../../utils/language.js';
import { boundedToken } from '../../../utils/fieldLimits.js';
import { toPublicOrder } from '../presentation/orderPresenter.js';

export const accountOrderQueriesRouter = Router();

function toPublicRevision(row: orders.OrderRevisionRow) {
  return {
    id: row.id,
    revisionNumber: row.revision_number,
    kind: row.kind,
    diff: row.diff,
    totalBefore: Number(row.total_before),
    totalAfter: Number(row.total_after),
    requestedBy: row.requested_by,
    // The modal renders the diff's "before" snapshot, so expose that
    // snapshot's hash separately from the revision's resulting hash.
    previousIntegrityToken: row.previous_content_hash
      ? orders.formatIntegrityToken(row.previous_content_hash)
      : null,
    integrityToken: orders.formatIntegrityToken(row.content_hash),
    createdAt: row.created_at,
  };
}

accountOrderQueriesRouter.get('/orders', requireAuth, async (req, res) => {
  const scope = req.query.scope === 'history' ? 'history' : 'active';
  const limit = orders.clampOrderListLimit(req.query.limit);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const { rows, nextCursor, hasMore } = await orders.listForUser(pool, req.user!.id, scope, {
    limit,
    cursor,
  });
  const language = requestLanguage(req);
  const [trackingByCode, revisionCounts] = await Promise.all([
    couriers.trackingAvailableByCode(
      pool,
      rows.map(({ order }) => order.courier_code).filter((code): code is string => !!code),
    ),
    orders.revisionCountsByOrderId(
      pool,
      rows.map(({ order }) => order.id),
    ),
  ]);
  res.json({
    success: true,
    orders: await Promise.all(
      rows.map(({ order, items }) =>
        toPublicOrder(
          order,
          items,
          language,
          order.courier_code ? (trackingByCode.get(order.courier_code) ?? false) : false,
          revisionCounts.get(order.id) ?? 0,
        ),
      ),
    ),
    pagination: { limit, nextCursor, hasMore },
  });
});

/** Guest checkout never joins an account merely because its email matches
 * at list time. Matching leftover orders still require the confirmation
 * email's integrity code (or a still-valid manage-order token). Auto-attach
 * happens only at guest confirm when the account already exists. */
accountOrderQueriesRouter.get('/guest-orders', requireAuth, async (req, res) => {
  const ordersToClaim = await orders.listClaimableGuestOrders(pool, req.user!.id, req.user!.email);
  res.json({ success: true, orders: ordersToClaim });
});

accountOrderQueriesRouter.post('/guest-orders/:id/claim', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const integrityToken = boundedToken(req.body?.integrityToken);
  if (!integrityToken) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const result = await orders.claimGuestOrder(pool, req.user!.id, req.user!.email, id, integrityToken);
  if (result === 'not_found') {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (result === 'invalid_integrity_token') {
    res.status(400).json({ success: false, error: { code: 'invalid_integrity_token' } });
    return;
  }
  res.json({ success: true });
});

accountOrderQueriesRouter.post('/guest-orders/:id/dismiss', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!(await orders.dismissGuestOrder(pool, req.user!.id, req.user!.email, id))) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true });
});

accountOrderQueriesRouter.get('/orders/:id', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const result = await orders.getForUser(pool, req.user!.id, id);
  if (!result) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const courierCode = result.order.courier_code;
  const [trackingByCode, revisionCounts] = await Promise.all([
    courierCode ? couriers.trackingAvailableByCode(pool, [courierCode]) : Promise.resolve(undefined),
    orders.revisionCountsByOrderId(pool, [result.order.id]),
  ]);
  const trackingAvailable = courierCode ? (trackingByCode?.get(courierCode) ?? false) : false;
  res.json({
    success: true,
    order: await toPublicOrder(
      result.order,
      result.items,
      requestLanguage(req),
      trackingAvailable,
      revisionCounts.get(result.order.id) ?? 0,
    ),
  });
});

accountOrderQueriesRouter.get('/orders/:id/revisions', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const result = await orders.listRevisionsForUser(pool, req.user!.id, id);
  if (!result.ok) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({
    success: true,
    revisions: result.revisions.map(toPublicRevision),
  });
});

/** Powers the orders page's "Track my package" button — deliberately a
 * separate call from GET /orders/:id rather than embedding tracing events
 * inline there, since fetching tracing hits the carrier's live API (subject
 * to their own rate-limit guidance, see shippingTracking.service.ts) and
 * should only happen when the customer actually opens the tracking view,
 * not on every order-list/detail load. Most failure modes collapse to the
 * same customer-facing "not available right now" outcome — the customer
 * can't act differently on a config-missing vs. a carrier-API error, so
 * there's no reason to expose which one happened; the real reason is
 * logged server-side only. `shipment_not_found` is the one exception: it
 * means this specific order was moved to `to_send` without ever generating
 * a carrier shipment (e.g. via `npm run order -- set-status
 * --skip-shipment-label`), so there is nothing to retry — worth telling the
 * customer apart from a transient/config issue that might resolve later. */
accountOrderQueriesRouter.get('/orders/:id/tracking', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const result = await orders.getForUser(pool, req.user!.id, id);
  if (!result) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  try {
    const tracking = await getOrderTracking(pool, result.order, requestLanguage(req));
    res.json({ success: true, tracking });
  } catch (error) {
    if (error instanceof ShippingTrackingError) {
      console.error(`[account] tracking unavailable for order ${id}: ${error.code} — ${error.message}`);
      if (error.code === 'shipment_not_found') {
        res.status(404).json({ success: false, error: { code: 'shipment_not_found' } });
        return;
      }
      res.status(409).json({ success: false, error: { code: 'tracking_unavailable' } });
      return;
    }
    throw error;
  }
});

/** Preview only: no price or discount comes from the browser. The server
 * re-prices the cart for its currently selected address and courier. */
