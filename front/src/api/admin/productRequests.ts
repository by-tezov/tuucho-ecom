/** Admin made-to-order request endpoints. */
import { authHeaders, requestJson as request } from '../client';
import type { AdminOrderPagination } from './orders';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  AdminProductRequest,
  AdminProductRequestMessage,
  AdminProductRequestStatus,
} from '../contract/admin/productRequests';

export type { AdminProductRequest, AdminProductRequestMessage, AdminProductRequestStatus };

export function listAdminProductRequests(
  accessToken: string,
  status: AdminProductRequestStatus,
  page = 1,
): Promise<{ success: true; requests: AdminProductRequest[]; pagination: AdminOrderPagination }> {
  return request(`/admin/product-requests?status=${status}&page=${page}`, {
    headers: authHeaders(accessToken),
  });
}
export function getAdminProductRequest(
  accessToken: string,
  id: string,
): Promise<{ success: true; request: AdminProductRequest; messages: AdminProductRequestMessage[] }> {
  return request(`/admin/product-requests/${id}`, { headers: authHeaders(accessToken) });
}
export function respondAdminProductRequest(
  accessToken: string,
  id: string,
  body: { status: 'accepted' | 'refused'; price: number; message: string },
): Promise<{ success: true }> {
  return request(`/admin/product-requests/${id}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}
