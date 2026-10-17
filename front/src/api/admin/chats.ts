/** Admin connected-customer chat endpoints. */
import { authHeaders, requestJson as request } from '../client';
import { ApiError } from '../errors';
import { apiFetch } from '../http';
import type { AdminOrderPagination } from './orders';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  AdminChat,
  AdminChatAttachment,
  AdminChatMessage,
  AdminChatStatus,
  AdminChatSummary,
} from '../contract/admin/chats';

export type { AdminChat, AdminChatAttachment, AdminChatMessage, AdminChatStatus, AdminChatSummary };

/** Optional filters of the admin inbox lists, chats and guest contacts
 * (see docs/api/05-contact-chat.md). */
export interface AdminInboxListFilter {
  q?: string;
  period?: '7' | '30' | '90' | '365';
  sort?: 'activity' | 'opened_desc' | 'opened_asc';
}

export function inboxListParams(status: string, page: number, filter: AdminInboxListFilter): URLSearchParams {
  const params = new URLSearchParams({ status, page: String(page) });
  if (filter.q) params.set('q', filter.q);
  if (filter.period) params.set('period', filter.period);
  if (filter.sort && filter.sort !== 'activity') params.set('sort', filter.sort);
  return params;
}

export function listAdminChats(
  accessToken: string,
  status: AdminChatStatus,
  page = 1,
  filter: AdminInboxListFilter = {},
): Promise<{
  success: true;
  chats: AdminChatSummary[];
  pagination: AdminOrderPagination;
  ownerEmailSuppressionTimeoutMs: number;
}> {
  return request(`/admin/chats?${inboxListParams(status, page, filter)}`, {
    headers: authHeaders(accessToken),
  });
}
export function getAdminChat(
  accessToken: string,
  publicId: string,
): Promise<{ success: true; chat: AdminChat }> {
  return request(`/admin/chats/${encodeURIComponent(publicId)}`, { headers: authHeaders(accessToken) });
}
/** EventSource cannot attach the admin bearer token, so stream through fetch
 * exactly like account chat events. The page reloads its selected transcript
 * after any event to retain the authoritative attachment/message shape. */
export async function streamAdminChatEvents(
  accessToken: string,
  publicId: string,
  signal: AbortSignal,
  onEvent: () => void,
): Promise<void> {
  const response = await apiFetch(`/admin/chats/${encodeURIComponent(publicId)}/events`, {
    credentials: 'include',
    signal,
    headers: authHeaders(accessToken),
  });
  if (!response.ok) throw new ApiError('admin_chat_stream_failed', response.status);
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      buffer += decoder.decode(next.value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      for (const event of events) {
        if (/^event:\s*(message|session_closed|session_reopened)/m.test(event)) onEvent();
      }
    }
  } finally {
    reader.releaseLock();
  }
}
export function sendAdminChatMessage(
  accessToken: string,
  publicId: string,
  body: { body: string; images?: File[] },
): Promise<{ success: true; message: AdminChatMessage }> {
  const form = new FormData();
  form.append('body', body.body);
  for (const image of body.images ?? []) form.append('images', image);
  return request(`/admin/chats/${encodeURIComponent(publicId)}/messages`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: form,
  });
}
export function setAdminChatOwnerEmailNotification(
  accessToken: string,
  publicId: string,
  suppressed: boolean,
): Promise<{
  success: true;
  ownerEmailSuppressedUntil: string | null;
  ownerEmailSuppressionTimeoutMs: number;
}> {
  return request(`/admin/chats/${encodeURIComponent(publicId)}/owner-email-notification`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ suppressed }),
  });
}
export function notifyAdminChatUser(
  accessToken: string,
  publicId: string,
): Promise<{
  success: true;
  sent: boolean;
  reason?: 'no_owner_reply' | 'notification_disabled';
}> {
  return request(`/admin/chats/${encodeURIComponent(publicId)}/notify`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function closeAdminChat(
  accessToken: string,
  publicId: string,
): Promise<{ success: true; chat: AdminChat }> {
  return request(`/admin/chats/${encodeURIComponent(publicId)}/close`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export async function fetchAdminChatAttachment(
  accessToken: string,
  publicId: string,
  attachmentId: number,
): Promise<Blob> {
  const response = await apiFetch(
    `/admin/chats/${encodeURIComponent(publicId)}/attachments/${attachmentId}`,
    {
      headers: authHeaders(accessToken),
      credentials: 'include',
    },
  );
  if (!response.ok) throw new ApiError('not_found', response.status);
  return response.blob();
}
