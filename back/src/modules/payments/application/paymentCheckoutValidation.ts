import type { Pool } from 'pg';
import type { ShopPaymentMethod } from '../../settings/application/appPreferences.js';
import { warmAppPreferences, isShopPaymentMethodEnabled } from '../../settings/application/appPreferences.js';

/** Shop-wide enablement only. Country allowlists drive primary vs « + autres »
 * in the cart UI — overflow methods remain payable at create-intent. */
export async function assertShopPaymentMethodAllowedForCheckout(
  pool: Pool,
  method: ShopPaymentMethod,
): Promise<{ ok: true } | { ok: false; code: 'payment_method_forbidden' }> {
  await warmAppPreferences(pool);
  if (!isShopPaymentMethodEnabled(method)) {
    return { ok: false, code: 'payment_method_forbidden' };
  }
  return { ok: true };
}
