import type { Request, Response } from 'express';
import type pg from 'pg';
import {
  isShopPaymentMethodEnabled,
  warmAppPreferences,
  type ShopPaymentMethod,
} from '../../settings/application/appPreferences.js';
import { deleteUserPreference, setUserPreference } from '../../identity/application/userPreferences.js';
import {
  APPLE_PAY_ENABLED_PREFERENCE,
  BANCONTACT_ENABLED_PREFERENCE,
  DEFAULT_PAYMENT_METHOD_PREFERENCE,
  getStoredDefaultPaymentMethod,
  GOOGLE_PAY_ENABLED_PREFERENCE,
  NEW_CARD_ENABLED_PREFERENCE,
  PAYPAL_ENABLED_PREFERENCE,
} from './paymentPreferences.js';

type PreferenceToggle = {
  preferenceKey: string;
  responseKey: string;
  shopMethod: ShopPaymentMethod;
  /** When set, disabling clears this default type. */
  clearsDefaultType?: 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay';
};

const TOGGLES: Record<string, PreferenceToggle> = {
  paypal: {
    preferenceKey: PAYPAL_ENABLED_PREFERENCE,
    responseKey: 'paypalEnabled',
    shopMethod: 'paypal',
    clearsDefaultType: 'paypal',
  },
  bancontact: {
    preferenceKey: BANCONTACT_ENABLED_PREFERENCE,
    responseKey: 'bancontactEnabled',
    shopMethod: 'bancontact',
    clearsDefaultType: 'bancontact',
  },
  google_pay: {
    preferenceKey: GOOGLE_PAY_ENABLED_PREFERENCE,
    responseKey: 'googlePayEnabled',
    shopMethod: 'google_pay',
    clearsDefaultType: 'google_pay',
  },
  apple_pay: {
    preferenceKey: APPLE_PAY_ENABLED_PREFERENCE,
    responseKey: 'applePayEnabled',
    shopMethod: 'apple_pay',
    clearsDefaultType: 'apple_pay',
  },
  new_card: {
    preferenceKey: NEW_CARD_ENABLED_PREFERENCE,
    responseKey: 'newCardEnabled',
    shopMethod: 'card',
  },
};

/** Shared PUT handler for profile payment-method show/hide toggles. */
export async function handlePaymentMethodEnabledToggle(
  pool: pg.Pool,
  req: Request,
  res: Response,
  toggleKey: keyof typeof TOGGLES,
  shopForbidden: (res: Response) => void,
): Promise<void> {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const toggle = TOGGLES[toggleKey]!;
  await warmAppPreferences();
  if (!isShopPaymentMethodEnabled(toggle.shopMethod)) {
    shopForbidden(res);
    return;
  }
  await setUserPreference(pool, req.user!.id, toggle.preferenceKey, String(enabled));
  if (!enabled && toggle.clearsDefaultType) {
    const defaultPaymentMethod = await getStoredDefaultPaymentMethod(pool, req.user!.id);
    if (defaultPaymentMethod?.type === toggle.clearsDefaultType) {
      await deleteUserPreference(pool, req.user!.id, DEFAULT_PAYMENT_METHOD_PREFERENCE);
    }
  }
  res.json({ success: true, [toggle.responseKey]: enabled });
}
