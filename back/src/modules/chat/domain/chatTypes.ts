import type { ChatMessage } from '../../../contract/chat.js';
export type ChatSender = 'user' | 'owner';
export type ChatMessageSource = 'web' | 'email';
export type ChatSessionStatus = 'open' | 'closed';

export interface ChatSessionRow {
  id: string;
  public_id: string;
  user_id: string | null;
  visitor_email: string;
  visitor_identity: string | null;
  status: ChatSessionStatus;
  created_at: string;
  closed_at: string | null;
  last_message_at: string | null;
  last_user_active_at: string | null;
  transcript_sent_at: string | null;
  subject: string | null;
  owner_email_suppressed_until: string | null;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  sender: ChatSender;
  body: string;
  source: ChatMessageSource;
  email_message_id: string | null;
  outbound_message_id: string | null;
  client_message_id: string | null;
  created_at: string;
}

export interface ChatAttachmentMeta {
  id: number;
  /** On-disk private file name. */
  fileName: string;
  /** Visitor-facing original upload name. */
  originalName: string;
  byteSize: number;
  contentType: string;
}

export interface ChatMessageWithAttachments extends ChatMessageRow {
  attachments: ChatAttachmentMeta[];
}

/** What a chat message looks like on the wire. The API contract owns the
 * shape; the front is typed against the same declaration. */
export type PublicChatMessage = ChatMessage;

export interface OpsChatMessage extends Omit<PublicChatMessage, 'attachments'> {
  attachments: { id: number; fileName: string; absolutePath: string }[];
}

export interface PublicChatSession {
  publicId: string;
  status: ChatSessionStatus;
  visitorEmail: string;
  visitorIdentity: string | null;
  createdAt: string;
  closedAt: string | null;
  messages: PublicChatMessage[];
  unreadOwnerCount?: number;
}

export interface OpsChatSession extends Omit<PublicChatSession, 'messages'> {
  messages: OpsChatMessage[];
}
