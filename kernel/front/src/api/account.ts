/** Customer profile, address book, security and linked-account API. */
import type { Lang } from '../assets/i18n';
import type { ContrastPreference, ThemePreference } from '../theme/types';
import { authHeaders, requestJson as request } from './client';
import type { AuthUser } from './identity';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  Address,
  AddressInput,
  AddressKind,
  Country,
  Courier,
  CourierCatalogCountry,
  CourierDeliveryTime,
  CourierPacket,
  DeliveryNetwork,
  LinkAppleAccountResult,
  LinkFacebookAccountResult,
  LinkGoogleAccountResult,
  NotificationChannel,
  NotificationPreferences,
  PickupPoint,
  ProfilePatch,
  RecentLogin,
  UnlockAction,
} from './contract/account';

export type {
  Address,
  AddressInput,
  AddressKind,
  Country,
  Courier,
  CourierCatalogCountry,
  CourierDeliveryTime,
  CourierPacket,
  DeliveryNetwork,
  LinkAppleAccountResult,
  LinkFacebookAccountResult,
  LinkGoogleAccountResult,
  NotificationChannel,
  NotificationPreferences,
  PickupPoint,
  ProfilePatch,
  RecentLogin,
  UnlockAction,
};

export type { AuthUser } from './identity';
export { getProfile, resendEmailConfirmation } from './identity';
export { ApiError } from './errors';
/** `unlockToken` is only required once the account's stored name/phone are
 * no longer all empty — see AccountPage.tsx's ProfileForm `bypass` check,
 * mirrored server-side in account.routes.ts. */
export function updateProfile(
  accessToken: string,
  patch: ProfilePatch,
  unlockToken?: string,
): Promise<{ success: true; user: AuthUser }> {
  return request('/account/profile', {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(unlockToken ? { ...patch, unlockToken } : patch),
  });
}
/** Step-up re-authentication: exchanges the current password for a
 * short-lived, single-use token scoped to one of the 3 actions below (see
 * useSectionUnlock.ts) — required by changeEmail/changePassword/updateProfile
 * instead of asking for the password again in the same request. */
export function unlockAccountSection(
  accessToken: string,
  action: UnlockAction,
  currentPassword: string,
): Promise<{ success: true; unlockToken: string; action: UnlockAction; expiresAt: string }> {
  return request('/account/unlock', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ action, currentPassword }),
  });
}

export function requestUnlockOtp(accessToken: string, action: UnlockAction): Promise<{ success: true }> {
  return request('/account/request-unlock-otp', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ action }),
  });
}

export function unlockAccountSectionWithOtp(
  accessToken: string,
  action: UnlockAction,
  code: string,
): Promise<{ success: true; unlockToken: string; action: UnlockAction; expiresAt: string }> {
  return request('/account/unlock', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ action, code }),
  });
}

export function changeEmail(
  accessToken: string,
  newEmail: string,
  unlockToken: string,
): Promise<{ success: true; pendingEmail: string }> {
  return request('/account/change-email', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ newEmail, unlockToken }),
  });
}

export function changePassword(
  accessToken: string,
  newPassword: string,
  unlockToken: string,
): Promise<{ success: true }> {
  return request('/account/change-password', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ newPassword, unlockToken }),
  });
}
export function isLinkGoogleNeedsEmailChoice(
  result: LinkGoogleAccountResult,
): result is Extract<LinkGoogleAccountResult, { needsEmailChoice: true }> {
  return 'needsEmailChoice' in result && result.needsEmailChoice === true;
}

export function linkGoogleAccount(
  accessToken: string,
  idToken: string,
  unlockToken: string,
): Promise<LinkGoogleAccountResult> {
  return request('/account/link-google', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ idToken, unlockToken }),
  });
}

export function completeGoogleLink(
  accessToken: string,
  googleLinkToken: string,
  choice: 'keep' | 'switch',
  unlockToken: string,
): Promise<{ success: true; user: AuthUser }> {
  return request('/account/link-google/complete', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ googleLinkToken, choice, unlockToken }),
  });
}

/** Unlink Google — clears google_sub + google_email; email/password stay. */
export function unlinkGoogleAccount(
  accessToken: string,
  unlockToken: string,
): Promise<{ success: true; user: AuthUser }> {
  return request('/account/unlink-google', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ unlockToken }),
  });
}
export function isLinkAppleNeedsEmailChoice(
  result: LinkAppleAccountResult,
): result is Extract<LinkAppleAccountResult, { needsEmailChoice: true }> {
  return 'needsEmailChoice' in result && result.needsEmailChoice === true;
}

export function linkAppleAccount(
  accessToken: string,
  idToken: string,
  unlockToken: string,
  nonce: string,
): Promise<LinkAppleAccountResult> {
  return request('/account/link-apple', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ idToken, unlockToken, nonce }),
  });
}

export function completeAppleLink(
  accessToken: string,
  appleLinkToken: string,
  choice: 'keep' | 'switch',
  unlockToken: string,
): Promise<{ success: true; user: AuthUser }> {
  return request('/account/link-apple/complete', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ appleLinkToken, choice, unlockToken }),
  });
}

/** Unlink Apple — clears apple_sub + apple_email; email/password stay. */
export function unlinkAppleAccount(
  accessToken: string,
  unlockToken: string,
): Promise<{ success: true; user: AuthUser }> {
  return request('/account/unlink-apple', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ unlockToken }),
  });
}
export function isLinkFacebookNeedsEmailChoice(
  result: LinkFacebookAccountResult,
): result is Extract<LinkFacebookAccountResult, { needsEmailChoice: true }> {
  return 'needsEmailChoice' in result && result.needsEmailChoice === true;
}

export function linkFacebookAccount(
  accessToken: string,
  facebookAccessToken: string,
  unlockToken: string,
): Promise<LinkFacebookAccountResult> {
  return request('/account/link-facebook', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ accessToken: facebookAccessToken, unlockToken }),
  });
}

export function completeFacebookLink(
  accessToken: string,
  facebookLinkToken: string,
  choice: 'keep' | 'switch',
  unlockToken: string,
): Promise<{ success: true; user: AuthUser }> {
  return request('/account/link-facebook/complete', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ facebookLinkToken, choice, unlockToken }),
  });
}

export function unlinkFacebookAccount(
  accessToken: string,
  unlockToken: string,
): Promise<{ success: true; user: AuthUser }> {
  return request('/account/unlink-facebook', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ unlockToken }),
  });
}

export function listCountries(): Promise<{ success: true; countries: Country[] }> {
  return request('/account/address-countries');
}

/** Union of countries served by any shop-enabled courier — profile phone
 * country options (not the home-address country vocabulary). */
export function listPhoneCountries(): Promise<{ success: true; countries: Country[] }> {
  return request('/account/phone-countries');
}

/** Deliberately the full enabled courier list, never pre-filtered by an
 * address or by the caller's per-account disabled-couriers opt-outs —
 * AccountAddressesPage needs every shop courier so its tiles can toggle.
 * CartPage filters authenticated customers against listDisabledCouriers
 * (guests keep the full catalog) and computes country/network compatibility
 * itself, graying out (never hiding) whatever doesn't fit, with a reason. */
export function listCouriers(): Promise<{ success: true; couriers: Courier[] }> {
  return request('/account/couriers');
}

export function listAddresses(accessToken: string): Promise<{ success: true; addresses: Address[] }> {
  return request('/account/addresses', { headers: authHeaders(accessToken) });
}

/** Any owned address including one-time ones that listAddresses omits. */
export function getAddress(accessToken: string, id: string): Promise<{ success: true; address: Address }> {
  return request(`/account/addresses/${id}`, { headers: authHeaders(accessToken) });
}

export function createAddress(
  accessToken: string,
  input: AddressInput,
): Promise<{ success: true; address: Address }> {
  return request('/account/addresses', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function updateAddress(
  accessToken: string,
  id: string,
  patch: Partial<AddressInput>,
): Promise<{ success: true; address: Address }> {
  return request(`/account/addresses/${id}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(patch),
  });
}

export function deleteAddress(accessToken: string, id: string): Promise<{ success: true; deleted: true }> {
  return request(`/account/addresses/${id}`, { method: 'DELETE', headers: authHeaders(accessToken) });
}

export function setDefaultAddress(accessToken: string, id: string): Promise<{ success: true }> {
  return request(`/account/addresses/${id}/set-default`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

/** Clicking the default badge — deliberately leaves zero default addresses
 * (unlike deleting the default, which auto-promotes another); checkout then
 * requires an explicit address pick instead of auto-filling one. */
export function unsetDefaultAddress(accessToken: string, id: string): Promise<{ success: true }> {
  return request(`/account/addresses/${id}/unset-default`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function getDefaultCourier(
  accessToken: string,
): Promise<{ success: true; courierCode: string | null }> {
  return request('/account/default-courier', { headers: authHeaders(accessToken) });
}

export function setDefaultCourier(
  accessToken: string,
  courierCode: string,
): Promise<{ success: true; courierCode: string }> {
  return request('/account/default-courier', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ courierCode }),
  });
}

export function unsetDefaultCourier(accessToken: string): Promise<{ success: true }> {
  return request('/account/default-courier/unset-default', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

/** Per-customer opt-out of a specific courier (account/addresses page's
 * courier tiles) — independent of the shop-wide enabled list getDefaultCourier
 * above reads from. */
export function listDisabledCouriers(
  accessToken: string,
): Promise<{ success: true; courierCodes: string[] }> {
  return request('/account/disabled-couriers', { headers: authHeaders(accessToken) });
}

export function disableCourier(accessToken: string, courierCode: string): Promise<{ success: true }> {
  return request('/account/disabled-couriers', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ courierCode }),
  });
}

export function enableCourier(accessToken: string, courierCode: string): Promise<{ success: true }> {
  return request(`/account/disabled-couriers/${encodeURIComponent(courierCode)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function requestAccountDeletion(
  accessToken: string,
  unlockToken: string,
): Promise<{ success: true; deletionScheduledFor: string }> {
  return request('/account/request-deletion', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ unlockToken }),
  });
}

export function cancelAccountDeletion(accessToken: string): Promise<{ success: true; reactivated: boolean }> {
  return request('/account/cancel-deletion', { method: 'POST', headers: authHeaders(accessToken) });
}
export function updateLanguagePreference(accessToken: string, language: Lang): Promise<{ success: true }> {
  return request('/account/preferences/language', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ language }),
  });
}

export function getThemePreference(
  accessToken: string,
): Promise<{ success: true; theme: ThemePreference | null }> {
  return request('/account/preferences/theme', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export function updateThemePreference(
  accessToken: string,
  theme: ThemePreference,
): Promise<{ success: true; theme: ThemePreference }> {
  return request('/account/preferences/theme', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ theme }),
  });
}

export function getContrastPreference(
  accessToken: string,
): Promise<{ success: true; contrast: ContrastPreference | null }> {
  return request('/account/preferences/contrast', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export function updateContrastPreference(
  accessToken: string,
  contrast: ContrastPreference,
): Promise<{ success: true; contrast: ContrastPreference }> {
  return request('/account/preferences/contrast', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ contrast }),
  });
}

export function getOnboardingPreference(accessToken: string): Promise<{ success: true; completed: boolean }> {
  return request('/account/preferences/onboarding', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export function updateOnboardingPreference(accessToken: string): Promise<{ success: true; completed: true }> {
  return request('/account/preferences/onboarding', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ completed: true }),
  });
}
export function getNotificationPreferences(
  accessToken: string,
): Promise<{ success: true } & NotificationPreferences> {
  return request('/account/notification-preferences', { headers: authHeaders(accessToken) });
}

export function setNotificationPreference(
  accessToken: string,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<{ success: true } & NotificationPreferences> {
  return request('/account/notification-preferences', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ channel, enabled }),
  });
}
/** Account page's "recent logins" block — empty list either means nothing
 * to show yet or RECENT_LOGINS_DISPLAY_COUNT is 0 (see API.md); either way
 * the caller just hides the block. */
export function listRecentLogins(accessToken: string): Promise<{ success: true; logins: RecentLogin[] }> {
  return request('/account/recent-logins', { headers: authHeaders(accessToken) });
}
