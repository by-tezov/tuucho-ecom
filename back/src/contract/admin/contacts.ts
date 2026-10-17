/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/admin/contacts.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */

export type AdminUnconnectedContactStatus = 'new' | 'answered' | 'ignored';

export interface AdminUnconnectedContactSummary {
  publicId: string;
  email: string;
  identity: string;
  status: AdminUnconnectedContactStatus;
  createdAt: string;
  messageCount: number;
  preview: string;
}

export interface AdminUnconnectedContactAttachment {
  id: number;
  fileName: string;
}

export interface AdminUnconnectedContactMessage {
  id: number;
  direction: 'visitor' | 'admin';
  body: string;
  createdAt: string;
  attachments: AdminUnconnectedContactAttachment[];
}

export interface AdminUnconnectedContact {
  id: string;
  publicId: string;
  email: string;
  identity: string;
  status: AdminUnconnectedContactStatus;
  statusUpdatedAt: string;
  createdAt: string;
  messages: AdminUnconnectedContactMessage[];
}
