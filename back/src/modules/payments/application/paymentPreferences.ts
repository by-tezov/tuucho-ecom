import type pg from 'pg';
import {
  getShopPaymentMethodsSnapshot,
  isShopPaymentMethodEnabled,
  warmAppPreferences,
  type ShopPaymentMethod,
} from '../../settings/application/appPreferences.js';
import { getStripe, listPaymentMethods } from '../../../platform/stripe/stripeClient.js';
import { findUserById } from '../../identity/application/users.js';
import { getUserPreference } from '../../identity/application/userPreferences.js';
import { isNonEmptyString } from '../../../utils/validate.js';

export const DEFAULT_PAYMENT_METHOD_PREFERENCE = 'default_payment_method';
export const PAYPAL_ENABLED_PREFERENCE = 'paypal_enabled';
export const BANCONTACT_ENABLED_PREFERENCE = 'bancontact_enabled';
export const GOOGLE_PAY_ENABLED_PREFERENCE = 'google_pay_enabled';
export const APPLE_PAY_ENABLED_PREFERENCE = 'apple_pay_enabled';
export const NEW_CARD_ENABLED_PREFERENCE = 'new_card_enabled';

export type PublicDefaultPaymentMethod =
  | { type: 'card'; id: string }
  | { type: 'paypal' }
  | { type: 'bancontact' }
  | { type: 'google_pay' }
  | { type: 'apple_pay' };

function parseDefaultPaymentMethod(value: string | null): PublicDefaultPaymentMethod | null {
  if (value === 'paypal') return { type: 'paypal' };
  if (value === 'bancontact') return { type: 'bancontact' };
  if (value === 'google_pay') return { type: 'google_pay' };
  if (value === 'apple_pay') return { type: 'apple_pay' };
  if (value?.startsWith('card:') && isNonEmptyString(value.slice(5)))
    return { type: 'card', id: value.slice(5) };
  return null;
}

export async function getStoredDefaultPaymentMethod(
  pool: pg.Pool,
  userId: string,
): Promise<PublicDefaultPaymentMethod | null> {
  return parseDefaultPaymentMethod(await getUserPreference(pool, userId, DEFAULT_PAYMENT_METHOD_PREFERENCE));
}

async function getDefaultPaymentMethod(
  pool: pg.Pool,
  userId: string,
): Promise<PublicDefaultPaymentMethod | null> {
  await warmAppPreferences();
  const parsed = await getStoredDefaultPaymentMethod(pool, userId);
  if (!parsed) return null;
  const shopMethod: ShopPaymentMethod = parsed.type === 'card' ? 'card' : parsed.type;
  return isShopPaymentMethodEnabled(shopMethod) ? parsed : null;
}

async function getPaypalEnabled(pool: pg.Pool, userId: string): Promise<boolean> {
  return (await getUserPreference(pool, userId, PAYPAL_ENABLED_PREFERENCE)) !== 'false';
}

async function getBancontactEnabled(pool: pg.Pool, userId: string): Promise<boolean> {
  return (await getUserPreference(pool, userId, BANCONTACT_ENABLED_PREFERENCE)) !== 'false';
}

async function getGooglePayEnabled(pool: pg.Pool, userId: string): Promise<boolean> {
  return (await getUserPreference(pool, userId, GOOGLE_PAY_ENABLED_PREFERENCE)) !== 'false';
}

async function getApplePayEnabled(pool: pg.Pool, userId: string): Promise<boolean> {
  return (await getUserPreference(pool, userId, APPLE_PAY_ENABLED_PREFERENCE)) !== 'false';
}

async function getNewCardEnabled(pool: pg.Pool, userId: string): Promise<boolean> {
  return (await getUserPreference(pool, userId, NEW_CARD_ENABLED_PREFERENCE)) !== 'false';
}

export type CheckoutPaymentMethod =
  | 'paypal'
  | 'bancontact'
  | 'google_pay'
  | 'apple_pay'
  | 'new_card';

export function parseCheckoutPaymentMethod(value: unknown): CheckoutPaymentMethod | undefined {
  return value === 'paypal' ||
    value === 'bancontact' ||
    value === 'google_pay' ||
    value === 'apple_pay' ||
    value === 'new_card'
    ? value
    : undefined;
}

export async function buildPaymentMethodsPayload(pool: pg.Pool, userId: string) {
  await warmAppPreferences();
  const stripe = getStripe();
  const [
    user,
    defaultPaymentMethod,
    paypalEnabled,
    bancontactEnabled,
    googlePayEnabled,
    applePayEnabled,
    newCardEnabled,
  ] = await Promise.all([
    findUserById(pool, userId),
    getDefaultPaymentMethod(pool, userId),
    getPaypalEnabled(pool, userId),
    getBancontactEnabled(pool, userId),
    getGooglePayEnabled(pool, userId),
    getApplePayEnabled(pool, userId),
    getNewCardEnabled(pool, userId),
  ]);
  const preferences = {
    defaultPaymentMethod,
    paypalEnabled,
    bancontactEnabled,
    googlePayEnabled,
    applePayEnabled,
    newCardEnabled,
    shopPaymentMethods: getShopPaymentMethodsSnapshot(),
  };
  if (!stripe || !user?.stripe_customer_id) return { paymentMethods: [], ...preferences };
  return {
    paymentMethods: await listPaymentMethods(stripe, user.stripe_customer_id),
    ...preferences,
  };
}
