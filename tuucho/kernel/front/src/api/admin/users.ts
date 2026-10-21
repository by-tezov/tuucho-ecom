/** Admin user directory and per-user activity endpoints. */
import { authHeaders, requestJson as request } from '../client';
import type { AdminChatSummary } from './chats';
import type { AdminUnconnectedContactSummary } from './contacts';
import type { AdminOrderPagination } from './orders';
import type { AdminProductRequest } from './productRequests';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  AdminIdentityEventKind,
  AdminIdentityHistoryEvent,
  AdminUserLockSource,
  AdminUserOrderBucket,
  AdminUserOrderSummary,
  AdminUserStatus,
  AdminUserSummary,
} from '../contract/admin/users';

export type {
  AdminIdentityEventKind,
  AdminIdentityHistoryEvent,
  AdminUserLockSource,
  AdminUserOrderBucket,
  AdminUserOrderSummary,
  AdminUserStatus,
  AdminUserSummary,
};

export function listAdminUsers(
  accessToken: string,
  page = 1,
  limit = 15,
  role: 'user' | 'staff' | 'all' = 'user',
  query = '',
): Promise<{ success: true; users: AdminUserSummary[]; pagination: AdminOrderPagination }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (role !== 'user') params.set('role', role);
  if (query.trim()) params.set('q', query.trim());
  return request(`/admin/users?${params}`, { headers: authHeaders(accessToken) });
}

export function lockAdminUser(
  accessToken: string,
  id: string,
  reason: string,
): Promise<{
  success: true;
  user: {
    id: string;
    status: 'locked';
    lockedAt: string;
    lockReason: string;
    lockSource: AdminUserLockSource;
  };
}> {
  return request(`/admin/users/${encodeURIComponent(id)}/lock`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ reason }),
  });
}

export function unlockAdminUser(
  accessToken: string,
  id: string,
): Promise<{
  success: true;
  user: {
    id: string;
    status: 'active';
    lockedAt: null;
    lockReason: null;
    lockSource: null;
  };
}> {
  return request(`/admin/users/${encodeURIComponent(id)}/unlock`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function listAdminUserOrders(
  accessToken: string,
  userId: string,
  page = 1,
  limit = 15,
): Promise<{ success: true; orders: AdminUserOrderSummary[]; pagination: AdminOrderPagination }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/admin/users/${encodeURIComponent(userId)}/orders?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function listAdminUserChats(
  accessToken: string,
  userId: string,
  page = 1,
  limit = 15,
): Promise<{ success: true; chats: AdminChatSummary[]; pagination: AdminOrderPagination }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/admin/users/${encodeURIComponent(userId)}/chats?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function listAdminUserContacts(
  accessToken: string,
  userId: string,
  page = 1,
  limit = 15,
): Promise<{ success: true; contacts: AdminUnconnectedContactSummary[]; pagination: AdminOrderPagination }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/admin/users/${encodeURIComponent(userId)}/contacts?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function listAdminUserProductRequests(
  accessToken: string,
  userId: string,
  page = 1,
  limit = 15,
): Promise<{ success: true; requests: AdminProductRequest[]; pagination: AdminOrderPagination }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/admin/users/${encodeURIComponent(userId)}/product-requests?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function listAdminUserIdentityHistory(
  accessToken: string,
  userId: string,
  page = 1,
  limit = 15,
): Promise<{ success: true; events: AdminIdentityHistoryEvent[]; pagination: AdminOrderPagination }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/admin/users/${encodeURIComponent(userId)}/identity-history?${params}`, {
    headers: authHeaders(accessToken),
  });
}
