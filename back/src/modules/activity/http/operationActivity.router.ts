import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  isActivityCategory,
  isActivityOutcome,
} from '../domain/catalogue.js';
import { recordActivityBestEffort } from '../application/recordActivity.js';

export const operationActivityRouter = Router();

/** Operator-only journal write (deploy finish, bulk CLI summaries). Auth is
 * the OPS_TOKEN gate on the ops server. */
operationActivityRouter.post('/activity', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!isActivityCategory(body.category)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (typeof body.action !== 'string' || !body.action.trim()) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (typeof body.summary !== 'string' || !body.summary.trim()) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const outcome = isActivityOutcome(body.outcome) ? body.outcome : 'success';
  const targets = Array.isArray(body.targets)
    ? body.targets.filter((t): t is string => typeof t === 'string')
    : null;

  const result = await recordActivityBestEffort(pool, {
    category: body.category,
    action: body.action,
    summary: body.summary,
    outcome,
    origin: 'operator',
    operatorUser: typeof body.operatorUser === 'string' ? body.operatorUser : undefined,
    operatorHost: typeof body.operatorHost === 'string' ? body.operatorHost : undefined,
    mode: typeof body.mode === 'string' ? body.mode : undefined,
    sourceCommand:
      typeof body.sourceCommand === 'string'
        ? body.sourceCommand
        : Array.isArray(body.sourceCommand)
          ? body.sourceCommand.filter((s): s is string => typeof s === 'string')
          : undefined,
    targetType: typeof body.targetType === 'string' ? body.targetType : null,
    targetId: typeof body.targetId === 'string' ? body.targetId : null,
    targets,
    detail: body.detail,
  });

  if (!result.id) {
    res.status(500).json({
      success: false,
      error: { code: 'activity_write_failed', message: result.error },
    });
    return;
  }
  res.status(201).json({ success: true, id: result.id });
});
