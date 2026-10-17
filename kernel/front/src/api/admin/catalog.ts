/** Admin catalogue and stock endpoints. */
import { authHeaders, requestJson as request } from '../client';
import type { AdminOrderPagination } from './orders';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  AdminAccessoryStockRow,
  AdminLibraryStockRow,
  AdminUserLibraryStockRow,
} from '../contract/admin/catalog';

export type { AdminAccessoryStockRow, AdminLibraryStockRow, AdminUserLibraryStockRow };

/** The dashboard's two list switches. Sent to the API rather than applied to
 * the received rows: the list is paged, so filtering client-side would leave
 * a chunk looking empty while the server still reports more to come. */
export interface AdminStockListFilters {
  /** `visible` drops hidden products; `all` keeps them. */
  hidden: 'all' | 'visible';
  /** `in` drops sold-out rows; `all` keeps them. */
  stock: 'all' | 'in';
}

function stockFilterParams(params: URLSearchParams, filters?: AdminStockListFilters): URLSearchParams {
  if (filters?.hidden === 'visible') params.set('hidden', 'visible');
  if (filters?.stock === 'in') params.set('stock', 'in');
  return params;
}

export function getAdminLibraryStock(
  accessToken: string,
  page = 1,
  q = '',
  limit = 15,
  filters?: AdminStockListFilters,
): Promise<{
  success: true;
  rows: AdminLibraryStockRow[];
  featuredDays: number;
  pagination: AdminOrderPagination;
}> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q.trim()) params.set('q', q.trim());
  stockFilterParams(params, filters);
  return request(`/admin/library-stock?${params}`, { headers: authHeaders(accessToken) });
}
export function patchAdminLibraryStock(
  accessToken: string,
  productUid: string,
  body: {
    shapeKey: string;
    lengthKey: string;
    price?: number;
    sizes?: { XS: number; S: number; M: number; L: number };
  },
): Promise<{ success: true; row: AdminLibraryStockRow }> {
  return request(`/admin/library-stock/${encodeURIComponent(productUid)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

/** Starts (`true`) or clears (`false`) the set's "Nouveautés" window. The
 * length is the API's to decide — see `featuredDays` on the list response. */
export function setAdminLibraryStockFeatured(
  accessToken: string,
  productUid: string,
  featured: boolean,
): Promise<{ success: true; featuredUntil: string | null }> {
  return request(`/admin/library-stock/${encodeURIComponent(productUid)}/featured`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ featured }),
  });
}

/** A shape (every length of it) or one shape/length of a product; absent =
 * the whole product (kernel/back docs/plans/variant-visibility.md). */
export interface AdminHiddenScope {
  shapeKey: string;
  lengthKey?: string;
}

export interface AdminHiddenResult {
  success: true;
  /** The whole product. */
  hidden: boolean;
  /** Every shape/length of the product hidden on its own. */
  hiddenShapeLengths: Array<{ shapeKey: string; lengthKey: string }>;
}

export function setAdminLibraryStockHidden(
  accessToken: string,
  productUid: string,
  hidden: boolean,
  scope?: AdminHiddenScope,
): Promise<AdminHiddenResult> {
  return request(`/admin/library-stock/${encodeURIComponent(productUid)}/hidden`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ hidden, ...scope }),
  });
}
export function getAdminAccessoryStock(
  accessToken: string,
  page = 1,
  q = '',
  limit = 15,
  filters?: AdminStockListFilters,
): Promise<{
  success: true;
  rows: AdminAccessoryStockRow[];
  pagination: AdminOrderPagination;
}> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q.trim()) params.set('q', q.trim());
  stockFilterParams(params, filters);
  return request(`/admin/accessory-stock?${params}`, { headers: authHeaders(accessToken) });
}
export function patchAdminAccessoryStock(
  accessToken: string,
  productUid: string,
  body: {
    available?: number;
    unitPrice?: number;
    packPrices?: Record<string, number>;
  },
): Promise<{ success: true; row: AdminAccessoryStockRow }> {
  return request(`/admin/accessory-stock/${encodeURIComponent(productUid)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function setAdminAccessoryStockHidden(
  accessToken: string,
  productUid: string,
  hidden: boolean,
): Promise<{ success: true; hidden: boolean }> {
  return request(`/admin/accessory-stock/${encodeURIComponent(productUid)}/hidden`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ hidden }),
  });
}
export function getAdminUserLibraryStock(
  accessToken: string,
  page = 1,
  q = '',
  limit = 15,
  filters?: AdminStockListFilters,
): Promise<{
  success: true;
  rows: AdminUserLibraryStockRow[];
  pagination: AdminOrderPagination;
}> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q.trim()) params.set('q', q.trim());
  stockFilterParams(params, filters);
  return request(`/admin/user-library-stock?${params}`, { headers: authHeaders(accessToken) });
}
export function patchAdminUserLibraryStock(
  accessToken: string,
  productUid: string,
  body: {
    shapeKey: string;
    lengthKey: string;
    price?: number;
    sizes?: { XS: number; S: number; M: number; L: number };
  },
): Promise<{ success: true; row: AdminUserLibraryStockRow }> {
  return request(`/admin/user-library-stock/${encodeURIComponent(productUid)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function setAdminUserLibraryStockHidden(
  accessToken: string,
  productUid: string,
  hidden: boolean,
  scope?: AdminHiddenScope,
): Promise<AdminHiddenResult> {
  return request(`/admin/user-library-stock/${encodeURIComponent(productUid)}/hidden`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ hidden, ...scope }),
  });
}
