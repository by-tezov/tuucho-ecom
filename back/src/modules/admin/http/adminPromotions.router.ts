import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { boundedEmail } from '../../../utils/fieldLimits.js';
import { emailsByUserIds, findUserByEmailLower } from '../../identity/application/users.js';
import {
  deleteCartRule,
  listCartRules,
  setCartRuleEnabled,
  upsertCartRule,
  CART_RULE_KINDS,
  type CartRuleKind,
} from '../../commerce/application/cartRules.js';
import {
  deleteVoucher,
  generateUniqueVoucherCode,
  listVouchers,
  normalizeVoucherCode,
  upsertVoucher,
  type VoucherDesiredState,
  type VoucherOfferType,
} from '../../vouchers/application/vouchers.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';
import { isPluginEnabled } from '../../plugins/application/pluginStore.js';

export const adminPromotionsRouter = Router();

adminPromotionsRouter.use('/cart-rules', async (_req, res, next) => {
  if (!(await isPluginEnabled('commerce-cart-rules'))) {
    res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
    return;
  }
  next();
});

adminPromotionsRouter.use('/vouchers', async (_req, res, next) => {
  if (!(await isPluginEnabled('commerce-vouchers'))) {
    res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
    return;
  }
  next();
});

adminPromotionsRouter.get('/cart-rules', requireAuth, requirePermission('cart_rules'), async (_req, res) => {
  const rules = await listCartRules(pool);
  res.json({
    success: true,
    rules: rules.map((rule) => ({
      code: rule.code,
      kind: rule.kind,
      enabled: rule.enabled,
      priority: rule.priority,
      forbidVoucher: rule.forbid_voucher,
      params: rule.params,
    })),
  });
});

function isCartRuleKind(value: unknown): value is CartRuleKind {
  return typeof value === 'string' && (CART_RULE_KINDS as readonly string[]).includes(value);
}

function toAdminCartRule(rule: Awaited<ReturnType<typeof listCartRules>>[number]) {
  return {
    code: rule.code,
    kind: rule.kind,
    enabled: rule.enabled,
    priority: rule.priority,
    forbidVoucher: rule.forbid_voucher,
    params: rule.params,
  };
}

adminPromotionsRouter.post('/cart-rules', requireAuth, requirePermission('cart_rules'), async (req, res) => {
  const body = req.body ?? {};
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code || !isCartRuleKind(body.kind) || body.params === undefined) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const rule = await upsertCartRule(pool, {
      code,
      kind: body.kind,
      enabled: body.enabled !== false,
      priority: typeof body.priority === 'number' ? body.priority : undefined,
      forbidVoucher: body.forbidVoucher === true,
      params: body.params,
    });
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'promotions',
      action: 'promotions.cart_rule.upsert',
      summary: `Creation ou mise a jour de la regle panier ${code}`,
      targetType: 'cart_rule',
      targetId: code,
      detail: { kind: body.kind, enabled: body.enabled !== false },
    });
    res.json({ success: true, rule: toAdminCartRule(rule) });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_params') {
      res.status(400).json({ success: false, error: { code: 'invalid_params' } });
      return;
    }
    throw error;
  }
});

adminPromotionsRouter.patch('/cart-rules/:code/enabled', requireAuth, requirePermission('cart_rules'), async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const code = String(req.params.code);
  const { rows: beforeRows } = await pool.query<{ enabled: boolean }>(
    `select enabled from cart_rules where lower(code) = lower($1)`,
    [code],
  );
  if (!beforeRows[0]) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const beforeEnabled = beforeRows[0].enabled;
  const ok = await setCartRuleEnabled(pool, code, req.body.enabled);
  if (!ok) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const { changes, changeSummary, detail } = activityChangeDetail(
    {},
    { enabled: beforeEnabled },
    { enabled: req.body.enabled },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'promotions',
    action: req.body.enabled ? 'promotions.cart_rule.enable' : 'promotions.cart_rule.disable',
    summary:
      changes.length === 0
        ? `Regle panier ${code}: aucun changement`
        : `Regle panier ${code}: ${changeSummary}`,
    targetType: 'cart_rule',
    targetId: code,
    detail,
  });
  res.json({ success: true });
});

adminPromotionsRouter.delete('/cart-rules/:code', requireAuth, requirePermission('cart_rules'), async (req, res) => {
  const code = String(req.params.code);
  const deleted = await deleteCartRule(pool, code);
  if (!deleted) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'promotions',
    action: 'promotions.cart_rule.delete',
    summary: `Suppression de la regle panier ${code}`,
    targetType: 'cart_rule',
    targetId: code,
  });
  res.json({ success: true });
});

async function allowedUserIdsFromEmails(
  raw: unknown,
): Promise<{ ids: string[] } | { error: 'invalid_request' | 'not_found' }> {
  if (raw === undefined || raw === null) return { ids: [] };
  if (!Array.isArray(raw)) return { error: 'invalid_request' };
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') return { error: 'invalid_request' };
    const email = boundedEmail(item);
    if (!email) return { error: 'invalid_request' };
    if (seen.has(email)) continue;
    seen.add(email);
    const user = await findUserByEmailLower(pool, email);
    if (!user || user.status === 'deleted') return { error: 'not_found' };
    ids.push(user.id);
  }
  return { ids };
}

adminPromotionsRouter.get('/vouchers', requireAuth, requirePermission('vouchers'), async (_req, res) => {
  const { vouchers, redemptions } = await listVouchers(pool);
  const emailById = await emailsByUserIds(
    pool,
    vouchers.flatMap((voucher) => voucher.allowedUserIds),
  );
  const redemptionsByCode = new Map<string, typeof redemptions>();
  for (const redemption of redemptions) {
    const entries = redemptionsByCode.get(redemption.voucher_code) ?? [];
    entries.push(redemption);
    redemptionsByCode.set(redemption.voucher_code, entries);
  }
  res.json({
    success: true,
    vouchers: vouchers.map((voucher) => ({
      ...voucher,
      allowedEmails: voucher.allowedUserIds
        .map((id) => emailById.get(id))
        .filter((email): email is string => Boolean(email)),
      redemptions: (redemptionsByCode.get(voucher.code) ?? []).map((redemption) => ({
        email: redemption.email,
        orderNumber: redemption.order_number,
        redeemedAt: redemption.redeemed_at,
      })),
    })),
  });
});

adminPromotionsRouter.post('/vouchers', requireAuth, requirePermission('vouchers'), async (req, res) => {
  const body = req.body ?? {};
  const supplied = typeof body.code === 'string' ? normalizeVoucherCode(body.code) : '';
  const quantity = Number(body.quantity);
  const maxUsesPerUser =
    body.maxUsesPerUser === undefined || body.maxUsesPerUser === null ? 1 : Number(body.maxUsesPerUser);
  const minSubtotal =
    body.minSubtotal === undefined || body.minSubtotal === null ? null : Number(body.minSubtotal);
  const startsAt = typeof body.startsAt === 'string' ? body.startsAt : '';
  const endsAt = typeof body.endsAt === 'string' ? body.endsAt : '';
  const type = body.offerType as VoucherOfferType;
  const value = Number(body.value);
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(maxUsesPerUser) ||
    maxUsesPerUser < 0 ||
    (minSubtotal != null && (!Number.isFinite(minSubtotal) || minSubtotal <= 0)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startsAt) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endsAt) ||
    startsAt > endsAt ||
    !['percent', 'amount', 'free_shipping', 'free_item', 'free_item_nth'].includes(type)
  ) {
    return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  }
  if (minSubtotal != null && type !== 'amount' && type !== 'free_shipping') {
    return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  }
  const offer: VoucherDesiredState['offer'] = { type };
  if (type === 'percent') {
    if (!Number.isFinite(value) || value <= 0 || value > 100)
      return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    offer.percent = value;
  }
  if (type === 'amount' || type === 'free_item') {
    if (!Number.isFinite(value) || value <= 0)
      return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    if (type === 'amount') offer.amount = value;
    else offer.maxItemPrice = value;
  }
  if (type === 'free_item_nth') {
    if (!Number.isSafeInteger(value) || value < 1)
      return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    offer.requiredItemQuantity = value;
  }
  const allowed = await allowedUserIdsFromEmails(body.emails);
  if ('error' in allowed) {
    const status = allowed.error === 'not_found' ? 404 : 400;
    return void res.status(status).json({ success: false, error: { code: allowed.error } });
  }
  const code = supplied || (await generateUniqueVoucherCode(pool));
  if (supplied) {
    const exists = await pool.query('select 1 from vouchers where lower(code) = lower($1)', [code]);
    if (exists.rowCount)
      return void res.status(409).json({ success: false, error: { code: 'already_exists' } });
  }
  await upsertVoucher(
    pool,
    code,
    {
      enabled: true,
      quantity,
      maxUsesPerUser,
      minSubtotal,
      startsAt,
      endsAt,
      allowedUserIds: allowed.ids,
      offer,
    },
    true,
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'promotions',
    action: 'promotions.voucher.create',
    summary: `Creation du bon ${code}`,
    targetType: 'voucher',
    targetId: code,
    detail: { offerType: type, quantity, startsAt, endsAt },
  });
  res.status(201).json({ success: true, code });
});

adminPromotionsRouter.patch('/vouchers/:code/enabled', requireAuth, requirePermission('vouchers'), async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean')
    return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  const code = String(req.params.code);
  const { rows: beforeRows } = await pool.query<{ enabled: boolean }>(
    'select enabled from vouchers where lower(code) = lower($1)',
    [code],
  );
  if (!beforeRows[0]) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  const beforeEnabled = beforeRows[0].enabled;
  const { rowCount } = await pool.query(
    'update vouchers set enabled = $2, updated_at = now() where lower(code) = lower($1)',
    [code, req.body.enabled],
  );
  if (!rowCount) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  const { changes, changeSummary, detail } = activityChangeDetail(
    {},
    { enabled: beforeEnabled },
    { enabled: req.body.enabled },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'promotions',
    action: req.body.enabled ? 'promotions.voucher.enable' : 'promotions.voucher.disable',
    summary:
      changes.length === 0
        ? `Bon ${code}: aucun changement`
        : `Bon ${code}: ${changeSummary}`,
    targetType: 'voucher',
    targetId: code,
    detail,
  });
  res.json({ success: true });
});

adminPromotionsRouter.delete('/vouchers/:code', requireAuth, requirePermission('vouchers'), async (req, res) => {
  const code = String(req.params.code);
  const result = await deleteVoucher(pool, code);
  if (result === 'deleted') {
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'promotions',
      action: 'promotions.voucher.delete',
      summary: `Suppression du bon ${code}`,
      targetType: 'voucher',
      targetId: code,
    });
    return void res.json({ success: true });
  }
  if (result === 'not_found')
    return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  res.status(409).json({ success: false, error: { code: 'voucher_not_deletable' } });
});
