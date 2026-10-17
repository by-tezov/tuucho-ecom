/** Administration journal endpoints. */
import { authHeaders, requestJson as request } from '../client';

export type AdminActivityCategory =
  | 'catalogue'
  | 'orders'
  | 'accounts'
  | 'loyalty'
  | 'gift'
  | 'promotions'
  | 'shipping'
  | 'messaging'
  | 'settings'
  | 'operations'
  | 'deploy';

export type AdminActivityOrigin = 'admin' | 'operator' | 'system';

export type AdminActivityEntry = {
  id: string;
  occurredAt: string;
  category: AdminActivityCategory;
  action: string;
  outcome: 'success' | 'failure';
  origin: AdminActivityOrigin;
  actorUserId: string | null;
  actorEmail: string | null;
  actorLabel: string;
  operatorUser: string | null;
  operatorHost: string | null;
  mode: string | null;
  sourceCommand: string | null;
  targetType: string | null;
  targetId: string | null;
  targets: string[];
  summary: string;
  detail: Record<string, unknown>;
};

export type AdminActivityActor = { userId: string; email: string };

export function listAdminActivity(
  accessToken: string,
  opts: {
    page?: number;
    pageSize?: number;
    category?: AdminActivityCategory | '';
    origin?: AdminActivityOrigin | '';
    actorUserId?: string;
    q?: string;
  } = {},
): Promise<{
  success: true;
  entries: AdminActivityEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const params = new URLSearchParams({
    page: String(opts.page ?? 1),
    pageSize: String(opts.pageSize ?? 30),
  });
  if (opts.category) params.set('category', opts.category);
  if (opts.origin) params.set('origin', opts.origin);
  if (opts.actorUserId) params.set('actorUserId', opts.actorUserId);
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  return request(`/admin/activity?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function listAdminActivityActors(
  accessToken: string,
): Promise<{ success: true; actors: AdminActivityActor[] }> {
  return request('/admin/activity/actors', {
    headers: authHeaders(accessToken),
  });
}

export function clearAdminActivity(accessToken: string): Promise<{ success: true; clearedFiles: number }> {
  return request('/admin/activity/clear', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}
