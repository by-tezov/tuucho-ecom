/** Administration of the private sent-mail journal. */
import { authHeaders, requestJson as request } from '../client';
import type { AdminEmailLogTail } from '../contract/admin/emailLog';

export type AdminEmailLogQuery = {
  lines?: number;
  kind?: string;
  outcome?: string;
  q?: string;
};

export function getAdminEmailLog(
  accessToken: string,
  query: AdminEmailLogQuery = {},
): Promise<{ success: true } & AdminEmailLogTail> {
  const params = new URLSearchParams({ lines: String(query.lines ?? 100) });
  if (query.kind) params.set('kind', query.kind);
  if (query.outcome) params.set('outcome', query.outcome);
  if (query.q) params.set('q', query.q);
  return request(`/admin/email-log?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function clearAdminEmailLog(accessToken: string): Promise<{ success: true; clearedFiles: number }> {
  return request('/admin/email-log/clear', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}
