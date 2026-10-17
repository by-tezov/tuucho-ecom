/** Administration of private cron journals. */
import { authHeaders, requestJson as request } from '../client';
import type { AdminCronLogKind, AdminCronLogTail } from '../contract/admin/cronLogs';

export type { AdminCronLogKind };

export function getAdminCronLog(
  accessToken: string,
  kind: AdminCronLogKind,
  lines = 100,
): Promise<{ success: true } & AdminCronLogTail> {
  const params = new URLSearchParams({ lines: String(lines) });
  return request(`/admin/cron-logs/${encodeURIComponent(kind)}?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function clearAdminCronLog(
  accessToken: string,
  kind: AdminCronLogKind,
): Promise<{ success: true; clearedFiles: number }> {
  return request(`/admin/cron-logs/${encodeURIComponent(kind)}/clear`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}
