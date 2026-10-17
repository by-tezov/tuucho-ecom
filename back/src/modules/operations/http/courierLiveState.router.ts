import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  applyCourierLiveState,
  readCourierLiveState,
  type CourierLiveStateEntry,
} from '../application/courierLiveState.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

/** OPS-only live courier toggles (shop-wide + per-country). Manager import
 * remains authoritative for structure; this applies runtime open/closed state
 * from `COURIER_LIVE_DEFAULTS` after seed. */
export const courierLiveStateRouter = Router();

function parseEntries(body: unknown): CourierLiveStateEntry[] | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const couriers = (body as { couriers?: unknown }).couriers;
  if (!Array.isArray(couriers) || couriers.length === 0) return null;
  const entries: CourierLiveStateEntry[] = [];
  for (const raw of couriers) {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as { code?: unknown; enabled?: unknown; enabledCountries?: unknown };
    if (typeof row.code !== 'string' || !row.code.trim()) return null;
    if (typeof row.enabled !== 'boolean') return null;
    if (!Array.isArray(row.enabledCountries)) return null;
    const enabledCountries: string[] = [];
    for (const code of row.enabledCountries) {
      if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code.trim().toUpperCase())) return null;
      enabledCountries.push(code.trim().toUpperCase());
    }
    entries.push({
      code: row.code.trim(),
      enabled: row.enabled,
      enabledCountries,
    });
  }
  return entries;
}

courierLiveStateRouter.get('/', async (_req, res) => {
  res.json({ success: true, couriers: await readCourierLiveState(pool) });
});

courierLiveStateRouter.patch('/', async (req, res) => {
  const entries = parseEntries(req.body);
  if (!entries) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const couriers = await applyCourierLiveState(pool, entries);
    await recordOperatorActivityBestEffort(pool, {
      category: 'shipping',
      action: 'courier.live_state',
      summary: `Etat live livreurs: ${entries.length} maj`,
      detail: { codes: entries.map((entry) => entry.code) },
      targets: entries.map((entry) => entry.code),
    });
    res.json({ success: true, couriers });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'courier live state update failed',
    });
  }
});
