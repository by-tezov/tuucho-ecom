import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { getGiftSettings } from '../../plugins/application/pluginBridges.js';

/** OPS-only gift programme numbers. The programme is always on.
 * Mounted at `/operation/gift`. */
export const giftOpsRouter = Router();

giftOpsRouter.get('/', async (_req, res) => {
  const settings = await getGiftSettings(pool);
  res.json({ success: true, settings });
});
