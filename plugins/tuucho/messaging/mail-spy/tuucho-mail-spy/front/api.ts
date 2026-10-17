import { authHeaders, requestJson as request } from '@kernel/front/api/client';

export type SpyMailFilter = 'role' | 'email' | 'kind';

export type SpyMailRecipient = {
  id: string;
  channelId: string;
  filter: 'role' | 'email';
  value: string;
};

export type SpyMailChannel = {
  id: string;
  pluginId: string;
  title: string;
  description: string;
  filters: SpyMailFilter[];
  enabled: boolean;
  recipients: SpyMailRecipient[];
};

export type SpyMailStaffRole = { code: string; label: string };

export function getAdminSpyMail(
  accessToken: string,
): Promise<{ success: true; channels: SpyMailChannel[]; staffRoles: SpyMailStaffRole[] }> {
  return request('/admin/spy-mail', { headers: authHeaders(accessToken) });
}

export function patchAdminSpyMailChannel(
  accessToken: string,
  channelId: string,
  enabled: boolean,
): Promise<{ success: true }> {
  return request(`/admin/spy-mail/channels/${encodeURIComponent(channelId)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
  });
}

export function addAdminSpyMailRecipient(
  accessToken: string,
  channelId: string,
  filter: 'role' | 'email',
  value: string,
): Promise<{ success: true; recipient: SpyMailRecipient }> {
  return request(`/admin/spy-mail/channels/${encodeURIComponent(channelId)}/recipients`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ filter, value }),
  });
}

export function deleteAdminSpyMailRecipient(accessToken: string, id: string): Promise<{ success: true }> {
  return request(`/admin/spy-mail/recipients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}
