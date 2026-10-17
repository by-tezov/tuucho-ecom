/** Administration of the private API diagnostic journal. */
import { authHeaders, requestJson as request } from '../client';
import type { AdminApiLogTail } from '../contract/admin/apiLog';

export type AdminApiLogQuery = {
  lines?: number;
  route?: string;
  from?: string;
  to?: string;
  q?: string;
};

export function getAdminApiLog(
  accessToken: string,
  query: AdminApiLogQuery = {},
): Promise<{ success: true } & AdminApiLogTail> {
  const params = new URLSearchParams({ lines: String(query.lines ?? 100) });
  if (query.route) params.set('route', query.route);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.q) params.set('q', query.q);
  return request(`/admin/api-log?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function clearAdminApiLog(accessToken: string): Promise<{ success: true; clearedFiles: number }> {
  return request('/admin/api-log/clear', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}
