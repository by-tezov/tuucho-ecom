/** Admin cart-rule, voucher, preference, and shipping endpoints. */
import { authHeaders, requestJson as request } from '../client';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  AdminCartRule,
  AdminCartRuleFreeShippingParams,
  AdminCartRuleGiftParams,
  AdminCartRuleKind,
  AdminCartRuleNailTierParams,
  AdminCartRuleParams,
  AdminPreferences,
  AdminShippingAddressCountry,
  AdminShippingCatalog,
  AdminShippingCourier,
  AdminShippingCourierCountry,
  AdminSpyKind,
  AdminVoucher,
  AdminVoucherOfferType,
  AdminVoucherRedemption,
} from '../contract/admin/commerce';

export type {
  AdminCartRule,
  AdminCartRuleFreeShippingParams,
  AdminCartRuleGiftParams,
  AdminCartRuleKind,
  AdminCartRuleNailTierParams,
  AdminCartRuleParams,
  AdminPreferences,
  AdminShippingAddressCountry,
  AdminShippingCatalog,
  AdminShippingCourier,
  AdminShippingCourierCountry,
  AdminSpyKind,
  AdminVoucher,
  AdminVoucherOfferType,
  AdminVoucherRedemption,
};

export function getAdminCartRules(accessToken: string): Promise<{ success: true; rules: AdminCartRule[] }> {
  return request('/admin/cart-rules', { headers: authHeaders(accessToken) });
}

export function upsertAdminCartRule(
  accessToken: string,
  body: {
    code: string;
    kind: AdminCartRuleKind;
    enabled?: boolean;
    priority?: number;
    forbidVoucher?: boolean;
    params: AdminCartRuleParams;
  },
): Promise<{ success: true; rule: AdminCartRule }> {
  return request('/admin/cart-rules', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function setAdminCartRuleEnabled(
  accessToken: string,
  code: string,
  enabled: boolean,
): Promise<{ success: true }> {
  return request(`/admin/cart-rules/${encodeURIComponent(code)}/enabled`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

export function deleteAdminCartRule(accessToken: string, code: string): Promise<{ success: true }> {
  return request(`/admin/cart-rules/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}
export function getAdminVouchers(accessToken: string): Promise<{ success: true; vouchers: AdminVoucher[] }> {
  return request('/admin/vouchers', { headers: authHeaders(accessToken) });
}

export function createAdminVoucher(
  accessToken: string,
  body: {
    code?: string;
    quantity: number;
    maxUsesPerUser?: number;
    minSubtotal?: number | null;
    startsAt: string;
    endsAt: string;
    offerType: AdminVoucherOfferType;
    value?: number;
    emails?: string[];
  },
): Promise<{ success: true; code: string }> {
  return request('/admin/vouchers', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function setAdminVoucherEnabled(
  accessToken: string,
  code: string,
  enabled: boolean,
): Promise<{ success: true }> {
  return request(`/admin/vouchers/${encodeURIComponent(code)}/enabled`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

export function deleteAdminVoucher(accessToken: string, code: string): Promise<{ success: true }> {
  return request(`/admin/vouchers/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}
export function getAdminPreferences(
  accessToken: string,
): Promise<{ success: true; preferences: AdminPreferences }> {
  return request('/admin/preferences', { headers: authHeaders(accessToken) });
}

export function patchAdminPreferences(
  accessToken: string,
  body: {
    cronShipmentLogEnabled?: boolean;
    cronAccountDeletionLogEnabled?: boolean;
    cronGuestSavedCleanupLogEnabled?: boolean;
    cronLoyaltyLogEnabled?: boolean;
    cronGiftLogEnabled?: boolean;
    cronGiftPurgeLogEnabled?: boolean;
    cronPaymentAuthExpirySpyLogEnabled?: boolean;
    cronWarmLogEnabled?: boolean;
    apiLogEnabled?: boolean;
    emailLogEnabled?: boolean;
    contactEmailGuestEnabled?: boolean;
    contactEmailConnectedEnabled?: boolean;
    paymentCardEnabled?: boolean;
    paymentPaypalEnabled?: boolean;
    paymentBancontactEnabled?: boolean;
    paymentGooglePayEnabled?: boolean;
    paymentApplePayEnabled?: boolean;
    signInGoogleEnabled?: boolean;
    signInAppleEnabled?: boolean;
    signInFacebookEnabled?: boolean;
    facebookMobileDirectOAuthEnabled?: boolean;
    signInGoogleVerboseEnabled?: boolean;
    signInAppleVerboseEnabled?: boolean;
    signInFacebookVerboseEnabled?: boolean;
    outOfStockEnabled?: boolean;
    outOfStockSizeRequestEnabled?: boolean;
    paymentMethodCountries?: Partial<AdminPreferences['paymentMethodCountries']>;
    spy?: Partial<Record<AdminSpyKind, boolean>>;
  },
): Promise<{ success: true; preferences: AdminPreferences }> {
  return request('/admin/preferences', {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}
export function getAdminShippingCatalog(
  accessToken: string,
): Promise<{ success: true } & AdminShippingCatalog> {
  return request('/admin/shipping-catalog', { headers: authHeaders(accessToken) });
}

export function patchAdminAddressCountry(
  accessToken: string,
  code: string,
  enabled: boolean,
): Promise<{ success: true; code: string; enabled: boolean }> {
  return request(`/admin/address-countries/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

export function patchAdminCourier(
  accessToken: string,
  code: string,
  enabled: boolean,
): Promise<{ success: true; code: string; enabled: boolean }> {
  return request(`/admin/couriers/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

export function patchAdminCourierCountry(
  accessToken: string,
  courierCode: string,
  countryCode: string,
  enabled: boolean,
): Promise<{ success: true; code: string; countryCode: string; enabled: boolean }> {
  return request(
    `/admin/couriers/${encodeURIComponent(courierCode)}/countries/${encodeURIComponent(countryCode)}`,
    {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ enabled }),
    },
  );
}
