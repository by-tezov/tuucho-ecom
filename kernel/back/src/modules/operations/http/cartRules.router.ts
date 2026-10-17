import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  deleteCartRule,
  getCartRuleByCode,
  listCartRules,
  setCartRuleEnabled,
  upsertCartRule,
} from '../../plugins/application/pluginBridges.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

export const cartRulesRouter = Router();

function isKind(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toPublic(row: Awaited<ReturnType<typeof listCartRules>>[number]) {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    enabled: row.enabled,
    priority: row.priority,
    forbidVoucher: row.forbid_voucher,
    params: row.params,
  };
}

cartRulesRouter.get('/', async (_req, res) => {
  const rows = await listCartRules(pool);
  res.json({ success: true, rules: rows.map(toPublic) });
});

cartRulesRouter.get('/:code', async (req, res) => {
  const { code } = req.params as { code: string };
  const row = await getCartRuleByCode(pool, code);
  if (!row) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, rule: toPublic(row) });
});

cartRulesRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code || !isKind(body.kind) || body.params === undefined) {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
    });
    return;
  }
  try {
    const row = await upsertCartRule(pool, {
      code,
      kind: body.kind,
      enabled: body.enabled !== false,
      priority: typeof body.priority === 'number' ? body.priority : undefined,
      forbidVoucher: body.forbidVoucher === true,
      params: body.params,
    });
    await recordOperatorActivityBestEffort(pool, {
      category: 'promotions',
      action: 'cart_rule.upsert',
      summary: `Upsert regle panier: ${code}`,
      targetType: 'cart_rule',
      targetId: code,
      detail: { kind: body.kind, enabled: body.enabled !== false },
    });
    res.json({ success: true, rule: toPublic(row) });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_params') {
      res.status(400).json({ success: false, error: { code: 'invalid_params' } });
      return;
    }
    if (error instanceof Error && error.message === 'kind_mismatch') {
      res.status(409).json({ success: false, error: { code: 'kind_mismatch' } });
      return;
    }
    throw error;
  }
});

cartRulesRouter.post('/:code/enable', async (req, res) => {
  const { code } = req.params as { code: string };
  const ok = await setCartRuleEnabled(pool, code, true);
  if (!ok) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await recordOperatorActivityBestEffort(pool, {
    category: 'promotions',
    action: 'cart_rule.enable',
    summary: `Activation regle panier: ${code}`,
    targetType: 'cart_rule',
    targetId: code,
  });
  res.json({ success: true, enabled: true });
});

cartRulesRouter.post('/:code/disable', async (req, res) => {
  const { code } = req.params as { code: string };
  const ok = await setCartRuleEnabled(pool, code, false);
  if (!ok) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await recordOperatorActivityBestEffort(pool, {
    category: 'promotions',
    action: 'cart_rule.disable',
    summary: `Desactivation regle panier: ${code}`,
    targetType: 'cart_rule',
    targetId: code,
  });
  res.json({ success: true, enabled: false });
});

cartRulesRouter.delete('/:code', async (req, res) => {
  const { code } = req.params as { code: string };
  const deleted = await deleteCartRule(pool, code);
  if (!deleted) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await recordOperatorActivityBestEffort(pool, {
    category: 'promotions',
    action: 'cart_rule.delete',
    summary: `Suppression regle panier: ${code}`,
    targetType: 'cart_rule',
    targetId: code,
  });
  res.json({ success: true, deleted: true });
});
