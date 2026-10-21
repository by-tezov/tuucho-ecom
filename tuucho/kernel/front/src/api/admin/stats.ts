/** Admin dashboard and attention-count endpoints. */
import { authHeaders, requestJson as request } from '../client';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type { AdminOrderAttentionCounts, AdminStats, AdminStatsSizeBucket } from '../contract/admin/stats';

export type { AdminOrderAttentionCounts, AdminStats, AdminStatsSizeBucket };

export function getAdminOrderAttentionCounts(
  accessToken: string,
): Promise<{ success: true; counts: AdminOrderAttentionCounts }> {
  return request('/admin/orders/attention-counts', { headers: authHeaders(accessToken) });
}

export function getAdminChatAttentionCounts(
  accessToken: string,
): Promise<{ success: true; counts: { open: number } }> {
  return request('/admin/chats/attention-counts', { headers: authHeaders(accessToken) });
}

export function getAdminUnconnectedContactAttentionCounts(
  accessToken: string,
): Promise<{ success: true; counts: { new: number } }> {
  return request('/admin/unconnected-contacts/attention-counts', { headers: authHeaders(accessToken) });
}

export function getAdminProductRequestAttentionCounts(
  accessToken: string,
): Promise<{ success: true; counts: { requested: number } }> {
  return request('/admin/product-requests/attention-counts', { headers: authHeaders(accessToken) });
}
export function getAdminStats(accessToken: string): Promise<{ success: true } & AdminStats> {
  return request('/admin/stats', { headers: authHeaders(accessToken) });
}
