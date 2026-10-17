import { ApiError } from './errors';
import { apiFetch } from './http';
import { preferredLanguage } from '../assets/i18n/languagePreference';
import { shopConfig } from '../config/env';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type { AccountChatSession, AccountChatSummary, ChatAttachment, ChatMessage } from './contract/chat';

export type { AccountChatSession, AccountChatSummary, ChatAttachment, ChatMessage };

async function request<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(`/account/chat${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Accept-Language': preferredLanguage(),
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { code?: string };
  };
  if (!response.ok || payload.success === false)
    throw new ApiError(payload.error?.code ?? 'unknown_error', response.status);
  return payload as T;
}

/** Multipart variant for the two message-sending endpoints, which optionally
 * carry image attachments — no explicit Content-Type so fetch sets the
 * multipart boundary itself. */
async function requestForm<T>(accessToken: string, path: string, form: FormData): Promise<T> {
  const response = await apiFetch(`/account/chat${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}`, 'Accept-Language': preferredLanguage() },
    body: form,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { code?: string };
  };
  if (!response.ok || payload.success === false)
    throw new ApiError(payload.error?.code ?? 'unknown_error', response.status);
  return payload as T;
}

export function listAccountChatSessions(
  accessToken: string,
): Promise<{ success: true; data: { sessions: AccountChatSummary[] } }> {
  return request(accessToken, '/sessions');
}
export function getAccountChatSession(
  accessToken: string,
  publicId: string,
  options: { limit?: number; before?: number; after?: number } = {},
): Promise<{
  success: true;
  data: {
    session: AccountChatSession;
    unreadOwnerCount: number;
    pagination: {
      limit: number;
      hasMore: boolean;
      oldestId: number | null;
      newestId: number | null;
    };
  };
}> {
  const params = new URLSearchParams();
  if (options.limit != null) params.set('limit', String(options.limit));
  if (options.before != null) params.set('before', String(options.before));
  if (options.after != null) params.set('after', String(options.after));
  const query = params.toString();
  return request(accessToken, `/sessions/${encodeURIComponent(publicId)}${query ? `?${query}` : ''}`);
}
export function createAccountChatSession(
  accessToken: string,
  body: string,
  clientMessageId: string,
  images: File[] = [],
): Promise<{
  success: true;
  data: { session: AccountChatSession; unreadOwnerCount: number; message: ChatMessage };
}> {
  const form = new FormData();
  form.append('body', body);
  form.append('clientMessageId', clientMessageId);
  for (const image of images) form.append('images', image);
  return requestForm(accessToken, '/sessions', form);
}
export function sendAccountChatMessage(
  accessToken: string,
  publicId: string,
  body: string,
  clientMessageId: string,
  images: File[] = [],
): Promise<{ success: true; data: { message: ChatMessage } }> {
  const form = new FormData();
  form.append('body', body);
  form.append('clientMessageId', clientMessageId);
  for (const image of images) form.append('images', image);
  return requestForm(accessToken, `/sessions/${encodeURIComponent(publicId)}/messages`, form);
}
export function closeAccountChatSession(
  accessToken: string,
  publicId: string,
): Promise<{ success: true; data: { session: AccountChatSession; unreadOwnerCount: number } }> {
  return request(accessToken, `/sessions/${encodeURIComponent(publicId)}/close`, {
    method: 'POST',
    body: '{}',
  });
}
export function markAccountChatRead(
  accessToken: string,
  publicId: string,
  messageId: number,
): Promise<{ success: true; data: { unreadOwnerCount: number } }> {
  return request(accessToken, `/sessions/${encodeURIComponent(publicId)}/read`, {
    method: 'POST',
    body: JSON.stringify({ messageId }),
  });
}
export function setAccountChatPresence(
  accessToken: string,
  publicId: string,
  active: boolean,
): Promise<{ success: true }> {
  return request(accessToken, `/sessions/${encodeURIComponent(publicId)}/presence`, {
    method: 'POST',
    body: JSON.stringify({ active }),
  });
}

/** `<img src>` cannot carry a bearer token either, so attachments are fetched
 * as a blob and rendered through an object URL (see AccountContactChat). */
export async function fetchAccountChatAttachment(
  accessToken: string,
  publicId: string,
  attachmentId: number,
): Promise<Blob> {
  const response = await fetch(
    `${shopConfig.apiBaseUrl}/account/chat/sessions/${encodeURIComponent(publicId)}/attachments/${attachmentId}`,
    {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}`, 'Accept-Language': preferredLanguage() },
    },
  );
  if (!response.ok) throw new ApiError('attachment_fetch_failed', response.status);
  return response.blob();
}

/** EventSource cannot attach the account bearer token, so this uses fetch's
 * readable stream and the same authenticated contract as every account call. */
export async function streamAccountChatEvents(
  accessToken: string,
  publicId: string,
  signal: AbortSignal,
  onEvent: () => void,
): Promise<void> {
  const response = await fetch(
    `${shopConfig.apiBaseUrl}/account/chat/sessions/${encodeURIComponent(publicId)}/events`,
    {
      credentials: 'include',
      signal,
      headers: { Authorization: `Bearer ${accessToken}`, 'Accept-Language': preferredLanguage() },
    },
  );
  if (!response.ok) throw new ApiError('chat_stream_failed', response.status);
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
