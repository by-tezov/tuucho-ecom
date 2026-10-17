import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  getAppPreferencesSnapshot,
  patchAppPreferences,
  readShopPaymentMethodsSnapshot,
} from '../../settings/application/appPreferences.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

/** OPS-only shop-wide payment method controls. Mounted at
 * `/operation/payment-methods`, never on the public application router. */
export const paymentMethodsRouter = Router();

type PaymentMethodsSnapshot = {
  card: boolean;
  paypal: boolean;
  bancontact: boolean;
  googlePay: boolean;
  applePay: boolean;
};

function paymentMethodsFromPreferences(
  preferences: Awaited<ReturnType<typeof getAppPreferencesSnapshot>>,
): PaymentMethodsSnapshot {
  return {
    card: preferences.paymentCardEnabled,
    paypal: preferences.paymentPaypalEnabled,
    bancontact: preferences.paymentBancontactEnabled,
    googlePay: preferences.paymentGooglePayEnabled,
    applePay: preferences.paymentApplePayEnabled,
  };
}

paymentMethodsRouter.get('/', async (_req, res) => {
  res.json({ success: true, paymentMethods: await readShopPaymentMethodsSnapshot(pool) });
});

paymentMethodsRouter.patch('/', async (req, res) => {
  const body = req.body ?? {};
  const fields = ['card', 'paypal', 'bancontact', 'googlePay', 'applePay'] as const;
  if (fields.some((field) => body[field] !== undefined && typeof body[field] !== 'boolean')) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (!fields.some((field) => typeof body[field] === 'boolean')) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }

  const preferences = await patchAppPreferences(
    pool,
    {
      ...(typeof body.card === 'boolean' ? { paymentCardEnabled: body.card } : {}),
      ...(typeof body.paypal === 'boolean' ? { paymentPaypalEnabled: body.paypal } : {}),
      ...(typeof body.bancontact === 'boolean' ? { paymentBancontactEnabled: body.bancontact } : {}),
      ...(typeof body.googlePay === 'boolean' ? { paymentGooglePayEnabled: body.googlePay } : {}),
      ...(typeof body.applePay === 'boolean' ? { paymentApplePayEnabled: body.applePay } : {}),
    },
    null,
  );
  const paymentMethods = paymentMethodsFromPreferences(preferences);
  await recordOperatorActivityBestEffort(pool, {
    category: 'settings',
    action: 'payment_method.patch',
    summary: 'Mise a jour methodes de paiement',
    detail: { patch: body, paymentMethods },
  });
  res.json({ success: true, paymentMethods });
});
