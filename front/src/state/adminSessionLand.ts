/** Session cookie: this browser opening already sent the administrator
 * home. Shared across tabs, survives refresh, dropped when the browser
 * process ends (no Max-Age). Never holds tokens. */
export const ADMIN_SESSION_LAND_COOKIE = 'psn-admin-landed-v1';

function cookieAttributes(): string {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  return `path=/; SameSite=Lax${secure}`;
}

function hasLandCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const prefix = `${ADMIN_SESSION_LAND_COOKIE}=`;
  return document.cookie.split(';').some((part) => part.trim().startsWith(prefix));
}

export function isAdminBrowserSessionLive(): boolean {
  return hasLandCookie();
}

export function markAdminBrowserSessionLanded(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${ADMIN_SESSION_LAND_COOKIE}=1; ${cookieAttributes()}`;
}

export function clearAdminBrowserSession(): void {
  if (typeof document === 'undefined' || sessionStorage.getItem('psn-gift-receiver-isolated') === '1') return;
  document.cookie = `${ADMIN_SESSION_LAND_COOKIE}=; ${cookieAttributes()}; max-age=0`;
}
