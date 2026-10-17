import { Router } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import {
  isRelaxRateLimitsEnabledSync,
  reloadPreferences,
  warmAppPreferences,
} from '../../settings/application/appPreferences.js';

const PREFERENCE_KEY = 'relax_rate_limits';

export const operationRelaxRateLimitsRouter = Router();

function refuseProd(res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (config.target !== 'prod') return false;
  res.status(404).json({ success: false, error: { code: 'not_found' } });
  return true;
}

operationRelaxRateLimitsRouter.get('/relax-rate-limits', async (_req, res) => {
  if (refuseProd(res)) return;
  await warmAppPreferences(pool);
  const enabled = isRelaxRateLimitsEnabledSync();
  const stored = await pool.query<{ value: unknown }>(
    `select value from app_preferences where key = $1`,
    [PREFERENCE_KEY],
  );
  res.json({
    success: true,
    data: {
      enabled,
      override: stored.rows.length > 0,
    },
  });
});

operationRelaxRateLimitsRouter.put('/relax-rate-limits', async (req, res) => {
  if (refuseProd(res)) return;
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  await pool.query(
    `insert into app_preferences (key, value, updated_at, updated_by)
     values ($1, $2::jsonb, now(), null)
     on conflict (key) do update
       set value = excluded.value,
           updated_at = now(),
           updated_by = excluded.updated_by`,
    [PREFERENCE_KEY, JSON.stringify({ enabled })],
  );
  await reloadPreferences(pool);
  res.json({
    success: true,
    data: {
      enabled,
      override: true,
    },
  });
});

operationRelaxRateLimitsRouter.delete('/relax-rate-limits', async (_req, res) => {
  if (refuseProd(res)) return;
  await pool.query(`delete from app_preferences where key = $1`, [PREFERENCE_KEY]);
  await reloadPreferences(pool);
  await warmAppPreferences(pool);
  res.json({
    success: true,
    data: {
      enabled: isRelaxRateLimitsEnabledSync(),
      override: false,
    },
  });
});
