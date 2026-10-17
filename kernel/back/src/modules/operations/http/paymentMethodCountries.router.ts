import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import {
  patchPublicPaymentMethodCountries,
  readPublicPaymentMethodCountries,
} from '../../payments/application/paymentMethodCountries.js';

/** OPS-only per-method country allowlists. Mounted at
 * `/operation/payment-method-countries`. Empty list = all countries. */
export const paymentMethodCountriesRouter = Router();

function parsePatch(body: Record<string, unknown>) {
  const patch: Partial<Record<'card' | 'paypal' | 'bancontact' | 'googlePay' | 'applePay', string[]>> = {};
  const fields = ['card', 'paypal', 'bancontact', 'googlePay', 'applePay'] as const;
  let any = false;
  for (const field of fields) {
    const value = body[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return null;
    patch[field] = value.map((entry) => entry.trim().toUpperCase()).filter(Boolean);
    any = true;
  }
  return any ? patch : null;
}

paymentMethodCountriesRouter.get('/', async (_req, res) => {
  res.json({ success: true, paymentMethodCountries: await readPublicPaymentMethodCountries(pool) });
});

paymentMethodCountriesRouter.patch('/', async (req, res) => {
  const body = req.body ?? {};
  const patch = parsePatch(body);
  if (!patch) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  res.json({
    success: true,
    paymentMethodCountries: await patchPublicPaymentMethodCountries(pool, patch),
  });
});
