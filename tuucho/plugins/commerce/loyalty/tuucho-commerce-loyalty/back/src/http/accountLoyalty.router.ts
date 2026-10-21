import { Router } from 'express';
import { pool } from '@kernel/back/db/pool';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { requirePluginEnabled } from '@kernel/back/middleware/requirePluginEnabled';
import { getWalletSummary, listLedger } from '../application/loyalty.js';
import { CHECKOUT_FAILURE_STATUS } from '@kernel/back/modules/commerce/application/checkoutFailureStatus';
import { boundedVoucherCode } from '@kernel/back/utils/fieldLimits';
import { giftApi } from '../pluginPeers.js';
import { previewAccountCartLoyalty } from '../application/merchandiseLoyaltyPreview.js';

export const accountLoyaltyRouter = Router();

accountLoyaltyRouter.use(requirePluginEnabled('tuucho-commerce-loyalty'));
accountLoyaltyRouter.use(requireAuth);

accountLoyaltyRouter.get('/wallet', async (req, res) => {
  const wallet = await getWalletSummary(pool, req.user!.id);
  res.json({ success: true, wallet });
});

accountLoyaltyRouter.get('/ledger', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
  const result = await listLedger(pool, req.user!.id, page, pageSize);
  res.json({
    success: true,
    entries: result.entries,
    pagination: { page, pageSize, total: result.total },
  });
});

/** Merchandise-only earn/spend quote — shipping/address/courier are irrelevant. */
accountLoyaltyRouter.get('/preview', async (req, res) => {
  const applyLoyalty =
    typeof req.query.applyLoyalty === 'string' ? req.query.applyLoyalty === 'true' : undefined;
  const voucherCode = boundedVoucherCode(
    typeof req.query.voucherCode === 'string' ? req.query.voucherCode : undefined,
  );
  const priced = await previewAccountCartLoyalty(pool, req.user!.id, {
    applyLoyalty,
    voucherCode: voucherCode ?? undefined,
    excludeReservationId: await giftApi()?.coveringStockReservationIdForActiveCart(pool, req.user!.id),
  });
  if (!priced.ok) {
    res
      .status(CHECKOUT_FAILURE_STATUS[priced.reason] ?? 400)
      .json({ success: false, error: { code: priced.reason } });
    return;
  }
  const wallet = await getWalletSummary(pool, req.user!.id);
  const preview = priced.preview;
  res.json({
    success: true,
    preview: {
      enabled: true,
      earningEnabled: true,
      loyaltyCredit: preview.loyaltyCredit,
      loyaltyEarn: preview.loyaltyEarn,
      incompatibleWithVoucher: preview.incompatibleWithVoucher,
      total: preview.total,
      availableBalance: wallet.available,
      atRisk: wallet.atRisk,
      atRiskExpiresAt: wallet.atRiskExpiresAt,
    },
  });
});
