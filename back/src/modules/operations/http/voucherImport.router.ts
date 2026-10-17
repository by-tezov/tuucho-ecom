import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  deleteAllVouchers,
  deleteVoucher,
  listVouchers,
  listVoucherOfferTypeLabels,
  normalizeVoucherCode,
  syncVoucherOfferTypeLabels,
  upsertVoucher,
  type VoucherDesiredState,
  type VoucherOfferTypeLabels,
  type VoucherOfferType,
} from '../../vouchers/application/vouchers.js';
import { LANGUAGES } from '../../../utils/language.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

/** OPS-only bridge for pamsurin-manager/voucher/*.json. The source stays
 * outside the storefront; this exposes its import and private use ledger. */
export const voucherImportRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OFFER_TYPES: VoucherOfferType[] = ['percent', 'amount', 'free_shipping', 'free_item', 'free_item_nth'];

function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function desiredState(value: unknown): VoucherDesiredState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  const quantity = body.quantity;
  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !isDate(body.startsAt) ||
    !isDate(body.endsAt)
  )
    return undefined;
  if (body.startsAt > body.endsAt || !body.offer || typeof body.offer !== 'object') return undefined;
  const maxUsesPerUserRaw = body.maxUsesPerUser;
  const maxUsesPerUser =
    maxUsesPerUserRaw === undefined || maxUsesPerUserRaw === null
      ? 1
      : typeof maxUsesPerUserRaw === 'number' &&
          Number.isSafeInteger(maxUsesPerUserRaw) &&
          maxUsesPerUserRaw >= 0
        ? maxUsesPerUserRaw
        : undefined;
  if (maxUsesPerUser === undefined) return undefined;
  const minSubtotalRaw = body.minSubtotal;
  const minSubtotal =
    minSubtotalRaw === undefined || minSubtotalRaw === null
      ? null
      : typeof minSubtotalRaw === 'number' && Number.isFinite(minSubtotalRaw) && minSubtotalRaw > 0
        ? minSubtotalRaw
        : undefined;
  if (minSubtotal === undefined) return undefined;
  const allowedUserIds = body.allowedUserIds === undefined ? [] : body.allowedUserIds;
  if (
    !Array.isArray(allowedUserIds) ||
    !allowedUserIds.every((id) => typeof id === 'string' && UUID_RE.test(id)) ||
    new Set(allowedUserIds.map((id) => id.toLowerCase())).size !== allowedUserIds.length
  )
    return undefined;
  const rawOffer = body.offer as Record<string, unknown>;
  const type = rawOffer.type;
  if (!OFFER_TYPES.includes(String(type) as VoucherOfferType)) return undefined;
  const offer: VoucherDesiredState['offer'] = { type: type as VoucherOfferType };
  if (type === 'percent') {
    if (
      typeof rawOffer.percent !== 'number' ||
      !Number.isFinite(rawOffer.percent) ||
      rawOffer.percent <= 0 ||
      rawOffer.percent > 100
    )
      return undefined;
    offer.percent = rawOffer.percent;
  } else if (type === 'amount') {
    if (typeof rawOffer.amount !== 'number' || !Number.isFinite(rawOffer.amount) || rawOffer.amount <= 0)
      return undefined;
    offer.amount = rawOffer.amount;
  } else if (type === 'free_item') {
    const maxItemPrice = rawOffer.maxItemPrice;
    if (typeof maxItemPrice !== 'number' || !Number.isFinite(maxItemPrice) || maxItemPrice <= 0)
      return undefined;
    offer.maxItemPrice = maxItemPrice;
  } else if (type === 'free_item_nth') {
    const requiredItemQuantity = rawOffer.requiredItemQuantity;
    if (
      typeof requiredItemQuantity !== 'number' ||
      !Number.isSafeInteger(requiredItemQuantity) ||
      requiredItemQuantity <= 0
    )
      return undefined;
    offer.requiredItemQuantity = requiredItemQuantity;
  }
  if (minSubtotal != null && type !== 'amount' && type !== 'free_shipping') return undefined;
  return {
    enabled: body.enabled !== false,
    quantity,
    maxUsesPerUser,
    minSubtotal,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    allowedUserIds: allowedUserIds.map((id) => id.toLowerCase()).sort(),
    offer,
  };
}

/** `voucher/data-type.json` is intentionally complete: every displayed
 * voucher type has one non-empty template in every storefront language. */
function voucherOfferTypeLabels(value: unknown): VoucherOfferTypeLabels | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = value as Record<string, unknown>;
  if (Object.keys(entries).length !== OFFER_TYPES.length || !OFFER_TYPES.every((type) => type in entries)) {
    return undefined;
  }
  const labels: Partial<VoucherOfferTypeLabels> = {};
  for (const type of OFFER_TYPES) {
    const template = entries[type];
    if (!template || typeof template !== 'object' || Array.isArray(template)) return undefined;
    const values = template as Record<string, unknown>;
    if (!LANGUAGES.every((language) => typeof values[language] === 'string' && values[language].trim())) {
      return undefined;
    }
    labels[type] = Object.fromEntries(
      LANGUAGES.map((language) => [language, (values[language] as string).trim()]),
    ) as unknown as VoucherOfferTypeLabels[VoucherOfferType];
  }
  return labels as VoucherOfferTypeLabels;
}

/** Manager vocabulary bridge for voucher/data-type.json. */
voucherImportRouter.post('/types', async (req, res) => {
  const labels = voucherOfferTypeLabels(req.body?.types);
  if (!labels) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  await syncVoucherOfferTypeLabels(pool, labels);
  await recordOperatorActivityBestEffort(pool, {
    category: 'promotions',
    action: 'voucher.sync_types',
    summary: 'Sync libelles types de voucher',
    detail: { types: OFFER_TYPES.length },
  });
  res.json({ success: true, types: OFFER_TYPES.length });
});

voucherImportRouter.get('/types', async (_req, res) => {
  res.json({ success: true, types: await listVoucherOfferTypeLabels(pool) });
});

voucherImportRouter.get('/vouchers', async (_req, res) => {
  try {
    res.json({ success: true, ...(await listVouchers(pool)) });
  } catch (error) {
    // Operations are run from a local terminal with no server log access on
    // the LWS plan. Return the database error as JSON so the CLI can report
    // the actionable cause instead of Express's opaque HTML 500 page.
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

voucherImportRouter.post('/vouchers', async (req, res) => {
  const body = req.body ?? {};
  const code = typeof body.code === 'string' ? normalizeVoucherCode(body.code) : '';
  const desired = desiredState(body);
  if (!code || code.length > 160 || !desired) {
    res.status(400).json({ success: false, error: { code: 'invalid_voucher' } });
    return;
  }
  const result = await upsertVoucher(pool, code, desired, body.update === true);
  // Bulk seed hits this once per voucher; the CLI posts one summary row.
  res.json({ success: true, created: result === 'created', updated: result === 'updated' });
});

voucherImportRouter.delete('/vouchers', async (_req, res) => {
  try {
    const deleted = await deleteAllVouchers(pool);
    await recordOperatorActivityBestEffort(pool, {
      category: 'promotions',
      action: 'voucher.delete_all',
      summary: 'Suppression complete des vouchers',
      detail: { deleted },
    });
    res.json({ success: true, deleted });
  } catch (error) {
    if ((error as { code?: string }).code === '23503') {
      res.status(409).json({ success: false, error: { code: 'voucher_redeemed' } });
      return;
    }
    throw error;
  }
});

voucherImportRouter.delete('/vouchers/:code', async (req, res) => {
  const code = normalizeVoucherCode((req.params as { code: string }).code);
  if (!code || code.length > 160) {
    res.status(400).json({ success: false, error: { code: 'invalid_voucher' } });
    return;
  }
  const result = await deleteVoucher(pool, code);
  if (result === 'not_found') {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  if (result === 'redeemed') {
    res.status(409).json({ success: false, error: { code: 'voucher_redeemed' } });
    return;
  }
  if (result === 'active_hold') {
    res.status(409).json({ success: false, error: { code: 'voucher_hold_active' } });
    return;
  }
  await recordOperatorActivityBestEffort(pool, {
    category: 'promotions',
    action: 'voucher.delete',
    summary: `Suppression voucher: ${code}`,
    targetType: 'voucher',
    targetId: code,
  });
  res.json({ success: true, deleted: true });
});
