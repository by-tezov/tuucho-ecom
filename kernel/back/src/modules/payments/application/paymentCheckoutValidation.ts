import type { Pool } from 'pg';
import { getPaymentGatewayForMethod, listPaymentGateways } from '@tuucho/plugin-sdk';
import type {
  ShopPaymentMethod,
  ShopPaymentMethodsSnapshot,
} from '../../settings/application/appPreferences.js';
import { warmAppPreferences, isShopPaymentMethodEnabled, getShopPaymentMethodsSnapshot } from '../../settings/application/appPreferences.js';
import { ensurePluginsLoaded } from '../../plugins/application/loadPluginRuntime.js';

/** Shop-wide enablement plus the payment-method shell: the method must belong
 * to a registered gateway plugin. Country allowlists drive primary vs overflow
 * in the cart UI — overflow methods remain payable at create-intent. */
export async function assertShopPaymentMethodAllowedForCheckout(
  pool: Pool,
  method: ShopPaymentMethod,
): Promise<{ ok: true } | { ok: false; code: 'payment_method_forbidden' }> {
  await ensurePluginsLoaded();
  await warmAppPreferences(pool);
  if (!getPaymentGatewayForMethod(method)) {
    return { ok: false, code: 'payment_method_forbidden' };
  }
  if (!isShopPaymentMethodEnabled(method)) {
    return { ok: false, code: 'payment_method_forbidden' };
  }
  return { ok: true };
}

/** Prefs plus the payment-method shell: a method is listed only when a
 * registered gateway owns it. Disabling payment-stripe clears the list. */
export async function listedShopPaymentMethods(): Promise<ShopPaymentMethodsSnapshot> {
  await ensurePluginsLoaded();
  await warmAppPreferences();
  const snapshot = getShopPaymentMethodsSnapshot();
  return {
    card: snapshot.card && Boolean(getPaymentGatewayForMethod('card')),
    paypal: snapshot.paypal && Boolean(getPaymentGatewayForMethod('paypal')),
    bancontact: snapshot.bancontact && Boolean(getPaymentGatewayForMethod('bancontact')),
    googlePay: snapshot.googlePay && Boolean(getPaymentGatewayForMethod('google_pay')),
    applePay: snapshot.applePay && Boolean(getPaymentGatewayForMethod('apple_pay')),
  };
}

export async function listedPaymentGateways(): Promise<Array<{ id: string; methods: string[] }>> {
  await ensurePluginsLoaded();
  return listPaymentGateways().map((gateway) => ({ id: gateway.id, methods: gateway.methods }));
}
