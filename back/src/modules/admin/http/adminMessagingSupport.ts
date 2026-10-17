import { pool } from '../../../db/pool.js';
import { config } from '../../../config/env.js';
import { getProductRequestByPublicId } from '../../contact/application/productRequest.js';
import { findSessionByPublicId } from '../../chat/application/chat.js';
import { getUnconnectedContactByPublicId } from '../../contact/application/unconnectedContact.js';

export function adminProductRequest(request: Awaited<ReturnType<typeof getProductRequestByPublicId>>) {
  if (!request) return request;
  return {
    ...request,
    photoPath: request.photoPath ? `${config.publicMediaUrl}/${request.photoPath.replace(/^\/+/, '')}` : null,
  };
}

export function isChatStatus(value: unknown): value is 'open' | 'closed' {
  return value === 'open' || value === 'closed';
}

export async function adminChatFromParam(value: unknown) {
  return findSessionByPublicId(pool, String(value ?? '').toUpperCase());
}

export async function adminUnconnectedContactFromParam(value: unknown) {
  return getUnconnectedContactByPublicId(pool, String(value ?? '').toUpperCase());
}
