/** Admin unconnected-contact endpoints. */
import { authHeaders, requestJson as request } from '../client';
import { ApiError } from '../errors';
import { apiFetch } from '../http';
import type { AdminOrderPagination } from './orders';
import { inboxListParams, type AdminInboxListFilter } from './chats';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in kernel/back). Do not redeclare them here. */
import type {
  AdminUnconnectedContact,
  AdminUnconnectedContactAttachment,
  AdminUnconnectedContactMessage,
  AdminUnconnectedContactStatus,
  AdminUnconnectedContactSummary,
} from '../contract/admin/contacts';

export type {
  AdminUnconnectedContact,
  AdminUnconnectedContactAttachment,
  AdminUnconnectedContactMessage,
  AdminUnconnectedContactStatus,
  AdminUnconnectedContactSummary,
};

export function listAdminUnconnectedContacts(
  accessToken: string,
  status: AdminUnconnectedContactStatus,
  page = 1,
  filter: AdminInboxListFilter = {},
): Promise<{
  success: true;
  contacts: AdminUnconnectedContactSummary[];
  pagination: AdminOrderPagination;
}> {
  return request(`/admin/unconnected-contacts?${inboxListParams(status, page, filter)}`, {
    headers: authHeaders(accessToken),
  });
}
export function getAdminUnconnectedContact(
  accessToken: string,
  publicId: string,
): Promise<{ success: true; contact: AdminUnconnectedContact }> {
  return request(`/admin/unconnected-contacts/${encodeURIComponent(publicId)}`, {
    headers: authHeaders(accessToken),
  });
}
export function setAdminUnconnectedContactStatus(
  accessToken: string,
  publicId: string,
  status: AdminUnconnectedContactStatus,
): Promise<{
  success: true;
  contact: Pick<AdminUnconnectedContact, 'publicId' | 'status' | 'statusUpdatedAt'>;
}> {
  return request(`/admin/unconnected-contacts/${encodeURIComponent(publicId)}/status`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ status }),
  });
}
export function sendAdminUnconnectedContactReply(
  accessToken: string,
  publicId: string,
  body: { body: string; images?: File[] },
): Promise<{
  success: true;
  message: AdminUnconnectedContactMessage;
}> {
  const form = new FormData();
  form.append('body', body.body);
  for (const image of body.images ?? []) form.append('images', image);
  return request(`/admin/unconnected-contacts/${encodeURIComponent(publicId)}/replies`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: form,
  });
}
export async function fetchAdminUnconnectedContactAttachment(
  accessToken: string,
  publicId: string,
  attachmentId: number,
): Promise<Blob> {
  const response = await apiFetch(
    `/admin/unconnected-contacts/${encodeURIComponent(publicId)}/attachments/${attachmentId}`,
    {
      headers: authHeaders(accessToken),
      credentials: 'include',
    },
  );
  if (!response.ok) throw new ApiError('not_found', response.status);
  return response.blob();
}
