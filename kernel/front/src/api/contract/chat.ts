/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/chat.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

export interface ChatAttachment {
  id: number;
  fileName: string;
}

export interface ChatMessage {
  id: number;
  sender: 'user' | 'owner';
  body: string;
  createdAt: string;
  attachments: ChatAttachment[];
}

export interface AccountChatSession {
  publicId: string;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt: string | null;
  messages: ChatMessage[];
}

export interface AccountChatSummary {
  publicId: string;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt: string | null;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  preview: string;
  messageCount: number;
  unreadOwnerCount: number;
}
