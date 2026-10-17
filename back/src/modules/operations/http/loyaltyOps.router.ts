import { Router } from 'express';
import { getLoyaltySettings } from '../../loyalty/application/loyalty.js';

/** OPS read of loyalty programme numbers. Mounted at `/operation/loyalty`.
 * The programme itself is always on; there is no enable flag to patch. */
export const loyaltyOpsRouter = Router();

loyaltyOpsRouter.get('/', async (_req, res) => {
  const settings = getLoyaltySettings();
  res.json({
    success: true,
    loyalty: {
      valuePer100: settings.valuePer100,
      lotDurationMonths: settings.lotDurationMonths,
      burnNoticeWeeks: settings.burnNoticeWeeks,
      reminderIntervalDays: settings.reminderIntervalDays,
    },
  });
});
