/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/admin/chats.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */

export type AdminChatStatus = 'open' | 'closed';

export interface AdminChatSummary {
  publicId: string;
  status: AdminChatStatus;
  email: string;
  identity: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  preview: string;
}

export interface AdminChatAttachment {
  id: number;
  fileName: string;
}

export interface AdminChatMessage {
  id: number;
  sender: 'user' | 'owner';
  body: string;
  createdAt: string;
  attachments: AdminChatAttachment[];
}

export interface AdminChat {
  publicId: string;
  status: AdminChatStatus;
  visitorEmail: string;
  visitorIdentity: string | null;
  createdAt: string;
  closedAt: string | null;
  ownerEmailSuppressedUntil: string | null;
  messages: AdminChatMessage[];
}
