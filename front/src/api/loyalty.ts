/** Customer and administrator loyalty-program API. */
import { authHeaders, requestJson as request } from './client';
import type { AdminOrderPagination } from './admin';
import type { GuestCheckoutLine } from './checkout';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  LoyaltyAdminStats,
  LoyaltyCheckoutPreview,
  LoyaltyLedgerEntry,
  LoyaltyLedgerKind,
  LoyaltyManualOp,
  LoyaltyWalletSummary,
} from './contract/loyalty';

export type {
  LoyaltyAdminStats,
  LoyaltyCheckoutPreview,
  LoyaltyLedgerEntry,
  LoyaltyLedgerKind,
  LoyaltyManualOp,
  LoyaltyWalletSummary,
};

export { ApiError } from './errors';
export function getAdminUserLoyaltyWallet(
  accessToken: string,
  userId: string,
): Promise<{ success: true; wallet: LoyaltyWalletSummary }> {
  return request(`/admin/loyalty/users/${encodeURIComponent(userId)}/wallet`, {
    headers: authHeaders(accessToken),
  });
}

export function listAdminUserLoyaltyLedger(
  accessToken: string,
  userId: string,
  page = 1,
  pageSize = 20,
): Promise<{
  success: true;
  entries: LoyaltyLedgerEntry[];
  pagination: { page: number; pageSize: number; total: number };
}> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request(`/admin/loyalty/users/${encodeURIComponent(userId)}/ledger?${params}`, {
    headers: authHeaders(accessToken),
  });
}
export function listAdminLoyaltyManualOps(
  accessToken: string,
  page = 1,
  pageSize = 20,
): Promise<{
  success: true;
  entries: LoyaltyManualOp[];
  pagination: AdminOrderPagination;
}> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request(`/admin/loyalty/manual-ops?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function creditAdminLoyaltyByEmail(
  accessToken: string,
  email: string,
  amount: number,
  reason: string,
): Promise<{ success: true; wallet: LoyaltyWalletSummary; userId: string }> {
  return request('/admin/loyalty/credit', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ email, amount, reason }),
  });
}

export function uncreditAdminLoyaltyByEmail(
  accessToken: string,
  email: string,
  amount: number,
  reason: string,
): Promise<{ success: true; wallet: LoyaltyWalletSummary; userId: string }> {
  return request('/admin/loyalty/uncredit', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ email, amount, reason }),
  });
}

export function getLoyaltyWallet(
  accessToken: string,
): Promise<{ success: true; wallet: LoyaltyWalletSummary }> {
  return request('/account/loyalty/wallet', { headers: authHeaders(accessToken) });
}

export function listLoyaltyLedger(
  accessToken: string,
  page = 1,
  pageSize = 10,
): Promise<{
  success: true;
  entries: LoyaltyLedgerEntry[];
  pagination: { page: number; pageSize: number; total: number };
}> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request(`/account/loyalty/ledger?${params}`, { headers: authHeaders(accessToken) });
}

function loyaltyPreviewParams(input: {
  applyLoyalty?: boolean;
  voucherCode?: string | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (input.applyLoyalty !== undefined) params.set('applyLoyalty', String(input.applyLoyalty));
  if (input.voucherCode) params.set('voucherCode', input.voucherCode);
  return params;
}

export function getLoyaltyCheckoutPreview(
  accessToken: string,
  input: {
    applyLoyalty?: boolean;
    voucherCode?: string | null;
  } = {},
): Promise<{ success: true; preview: LoyaltyCheckoutPreview }> {
  const params = loyaltyPreviewParams(input);
  const qs = params.toString();
  return request(`/account/loyalty/preview${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(accessToken),
  });
}

export function getGuestLoyaltyCheckoutPreview(input: {
  items: GuestCheckoutLine[];
  voucherCode?: string;
}): Promise<{ success: true; preview: LoyaltyCheckoutPreview }> {
  return request('/checkout/loyalty/preview', {
    method: 'POST',
    body: JSON.stringify({
      items: input.items,
      ...(input.voucherCode ? { voucherCode: input.voucherCode } : {}),
    }),
  });
}
