import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  clearCourierData,
  deleteCourier,
  findCourierIdByCode,
  listCouriers,
} from '../../delivery/application/couriers.js';

import { InvalidCourier, importCourier, type CourierImportResult } from '../application/courierImport.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

export const courierRecordsRouter = Router();

/** Whole-courier-level idempotency, same shape as libraryImport.routes.ts's
 * POST /sets: a code already present with no `update: true` is a no-op,
 * not an error. With `update: true`, an existing courier is compared
 * field-by-field (courierStateDiffers) against the incoming payload —
 * genuinely unchanged is still a no-op. A difference updates the row
 * **in place** (same id) since orders.courier_id references it for
 * traceability. */
courierRecordsRouter.post('/couriers', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    res.json(await importCourier(body));
  } catch (error) {
    if (error instanceof InvalidCourier) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    throw error;
  }
});

/** Batch courier import. Results are positionally aligned with `couriers`. */
courierRecordsRouter.post('/couriers/batch', async (req, res) => {
  const items = Array.isArray(req.body?.couriers) ? (req.body.couriers as unknown[]) : undefined;
  if (
    !items ||
    items.length === 0 ||
    items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))
  ) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const couriers = items as Record<string, unknown>[];
  try {
    const results: CourierImportResult[] = [];
    for (const courier of couriers) results.push(await importCourier(courier));
    res.json({ success: true, results });
  } catch (error) {
    if (error instanceof InvalidCourier) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    throw error;
  }
});

/** Backs `courier -- check` — a full snapshot of every courier currently in
 * the DB (enabled or not), for the CLI to diff against pamsurin-manager's
 * local courier/*.json files. */
courierRecordsRouter.get('/couriers', async (_req, res) => {
  const couriers = await listCouriers(pool);
  res.json({ success: true, couriers });
});

/** Backs `courier -- delete <code>`. Cascades to its countries/networks/
 * packets rows; orders that already reference this courier keep their
 * snapshot fields intact (courier_id set null, courier_code/name stay). */
courierRecordsRouter.delete('/couriers/:code', async (req, res) => {
  const { code } = req.params as { code: string };
  const existingId = await findCourierIdByCode(pool, code);
  if (!existingId) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await deleteCourier(pool, existingId);
  await recordOperatorActivityBestEffort(pool, {
    category: 'shipping',
    action: 'courier.delete',
    summary: `Suppression livreur: ${code}`,
    targetType: 'courier',
    targetId: code,
  });
  res.json({ success: true, deleted: true });
});

/** Backs `courier -- delete-all` — same "wipe everything" shape as
 * POST /operation/library-import/clear. */
courierRecordsRouter.post('/clear', async (_req, res) => {
  const result = await clearCourierData(pool);
  await recordOperatorActivityBestEffort(pool, {
    category: 'shipping',
    action: 'courier.delete_all',
    summary: 'Suppression complete des livreurs',
    detail: result,
  });
  res.json({ success: true, ...result });
});
