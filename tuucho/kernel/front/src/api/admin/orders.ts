/** Admin order types, workflow, tracking, and label endpoints. */
import { authHeaders, requestJson as request } from '../client';
import { ApiError } from '../errors';
import { apiFetch } from '../http';
import type { OrderStatus, OrderTracking } from '../orders';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  AdminOrder,
  AdminOrderItem,
  AdminOrderPagination,
  AdminOrderReturnReview,
  AdminOrderReturnStockLine,
  AdminOrderSummary,
  OrderReturnFinancialPreview,
  OrderReturnRefundMode,
  ResolveOrderReturnBody,
  StripeResolutionAudit,
} from '../contract/admin/orders';

export type {
  AdminOrder,
  AdminOrderItem,
  AdminOrderPagination,
  AdminOrderReturnReview,
  AdminOrderReturnStockLine,
  AdminOrderSummary,
  OrderReturnFinancialPreview,
  OrderReturnRefundMode,
  ResolveOrderReturnBody,
  StripeResolutionAudit,
};

export function listAdminOrders(
  accessToken: string,
  status: OrderStatus,
  page = 1,
  verified?: boolean,
  limit = 15,
): Promise<{ success: true; orders: AdminOrderSummary[]; pagination: AdminOrderPagination }> {
  const params = new URLSearchParams({ status, page: String(page), limit: String(limit) });
  if (verified !== undefined) params.set('verified', String(verified));
  return request(`/admin/orders?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function getAdminOrder(
  accessToken: string,
  id: string,
): Promise<{ success: true; order: AdminOrder }> {
  return request(`/admin/orders/${id}`, { headers: authHeaders(accessToken) });
}

export function verifyAdminOrder(
  accessToken: string,
  id: string,
): Promise<{ success: true; order: AdminOrder }> {
  return request(`/admin/orders/${id}/verify`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function updateAdminOrderStatus(
  accessToken: string,
  id: string,
  body:
    | { status: 'in_preparation'; noPayment?: boolean; notifyCustomer?: boolean }
    | { status: 'to_send'; notifyCustomer?: boolean; skipShippingLabel?: boolean }
    | { status: 'sent' }
    | { advanceToReceived: true }
    | { advanceToReturnReview: true },
): Promise<{ success: true; order: AdminOrder }> {
  return request(`/admin/orders/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}
export function resolveAdminNeedReviewOrder(
  accessToken: string,
  id: string,
  body: { decision: 'continue' | 'cancel'; confirmed: true },
): Promise<{
  success: true;
  changed: boolean;
  stripeResolution: StripeResolutionAudit;
  order: AdminOrder;
}> {
  return request(`/admin/orders/${id}/need-review-resolution`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function getAdminOrderReturnFinancialPreview(
  accessToken: string,
  id: string,
): Promise<{ success: true; preview: OrderReturnFinancialPreview }> {
  return request(`/admin/orders/${id}/return-review/financial-preview`, {
    headers: authHeaders(accessToken),
  });
}

export function resolveAdminOrderReturn(
  accessToken: string,
  id: string,
  body: ResolveOrderReturnBody,
): Promise<{ success: true; changed: boolean; order: AdminOrder }> {
  return request(`/admin/orders/${id}/return-review/resolve`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function dismissAdminOrderReturn(
  accessToken: string,
  id: string,
  reason: string,
): Promise<{ success: true; order: AdminOrder }> {
  return request(`/admin/orders/${id}/return-review/dismiss`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ reason, confirmed: true }),
  });
}

export function retryAdminOrderReturnEmail(
  accessToken: string,
  id: string,
): Promise<{ success: true; emailStatus: 'sent' | 'failed'; order: AdminOrder }> {
  return request(`/admin/orders/${id}/return-review/retry-email`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function getAdminOrderTracking(
  accessToken: string,
  id: string,
): Promise<{ success: true; tracking: OrderTracking }> {
  return request(`/admin/orders/${id}/tracking`, { headers: authHeaders(accessToken) });
}

export async function downloadAdminOrderSticker(
  accessToken: string,
  id: string,
  orderNumber: string,
): Promise<void> {
  const response = await apiFetch(`/admin/orders/${id}/sticker`, { headers: authHeaders(accessToken) });
  if (!response.ok) {
    let body: { error?: { code?: string } } | undefined;
    try {
      body = (await response.json()) as { error?: { code?: string } };
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(body?.error?.code ?? 'unknown_error', response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `${orderNumber}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
