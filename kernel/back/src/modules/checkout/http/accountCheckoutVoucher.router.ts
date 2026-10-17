import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { voucherRateLimiter } from '../../../middleware/rateLimiters.js';
import { voucherOfferDescription } from '../../plugins/application/pluginBridges.js';
import { appliedCodeFromPlugins } from '../../orders/application/checkoutOpenings.js';
import { boundedPrintable, boundedToken, boundedVoucherCode } from '../../../utils/fieldLimits.js';
import { requestLanguage } from '../../../utils/language.js';
import { CHECKOUT_FAILURE_STATUS } from '../../commerce/application/checkoutFailureStatus.js';
import { requireAccountCheckoutSession } from './accountCheckoutSession.js';
import { accountCheckoutAddressFailure, priceAccountCart } from '../../plugins/application/pluginBridges.js';

export const accountCheckoutVoucherRouter = Router();

accountCheckoutVoucherRouter.post(
  '/checkout/voucher/validate',
  requireAuth,
  requireAccountCheckoutSession,
  voucherRateLimiter,
  async (req, res) => {
    const body = req.body ?? {};
    const addressId = boundedToken(body.addressId);
    const billingAddressId =
      body.billingAddressId === undefined || body.billingAddressId === null
        ? undefined
        : boundedToken(body.billingAddressId);
    const courierCode = boundedPrintable(body.courierCode, 64);
    const code = boundedVoucherCode(body.code);
    if (!addressId || !courierCode || !code) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (body.billingAddressId !== undefined && body.billingAddressId !== null && !billingAddressId) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const addressFailure = await accountCheckoutAddressFailure(
      pool,
      req.user!.id,
      res.locals.checkoutPrivacySessionId as string,
      addressId,
      billingAddressId,
    );
    if (addressFailure) {
      res
        .status(CHECKOUT_FAILURE_STATUS[addressFailure] ?? 404)
        .json({ success: false, error: { code: addressFailure } });
      return;
    }
    const priced = await priceAccountCart(
      pool,
      req.user!.id,
      addressId,
      courierCode,
      body.express === true,
      code,
      billingAddressId,
    );
    if (!priced.ok) {
      // Collapse voucher_* reasons so probes cannot distinguish not_found /
      // disabled / depleted / etc. Non-voucher checkout failures keep their codes.
      if (priced.reason.startsWith('voucher_')) {
        res.status(400).json({ success: false, error: { code: 'voucher_invalid' } });
        return;
      }
      res
        .status(CHECKOUT_FAILURE_STATUS[priced.reason] ?? 400)
        .json({ success: false, error: { code: priced.reason } });
      return;
    }
    const voucher = appliedCodeFromPlugins(priced.priced.plugins);
    res.json({
      success: true,
      extraLines: priced.priced.extraLines,
      plugins: priced.priced.plugins,
      voucher: voucher
        ? {
            ...voucher,
            description: await voucherOfferDescription(pool, voucher, requestLanguage(req)),
          }
        : null,
      subtotal: priced.priced.subtotal,
      shippingListFee: priced.priced.shippingListFee,
      shippingFee: priced.priced.shippingFee,
      rulesItemDiscount: priced.priced.rulesItemDiscount,
      cartRules: priced.priced.cartRules,
      total: priced.priced.total,
    });
  },
);
