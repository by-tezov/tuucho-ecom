import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { isLanguage, type Language } from '@kernel/back/utils/language';
import { decryptPii, emailLookupHash, encryptPii } from '@kernel/back/platform/security/piiCrypto';
import type { SavedPrivateImage } from '@kernel/back/media/privateUploads';

const UNCONNECTED_CONTACT_STATUSES = ['new', 'answered', 'ignored'] as const;
export type UnconnectedContactStatus = (typeof UNCONNECTED_CONTACT_STATUSES)[number];

export function isUnconnectedContactStatus(value: unknown): value is UnconnectedContactStatus {
  return typeof value === 'string' && (UNCONNECTED_CONTACT_STATUSES as readonly string[]).includes(value);
}

interface ContactRow {
  id: string;
  public_id: string;
  email: string;
  email_lookup: string | null;
  identity: string;
  status: UnconnectedContactStatus;
  status_updated_at: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  contact_id: string;
  direction: 'visitor' | 'admin';
  body: string;
  created_at: string;
}

interface AttachmentRow {
  id: string;
  message_id: string;
  file_name: string;
  original_name: string;
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

export interface AdminUnconnectedContactSummary {
  publicId: string;
  email: string;
  identity: string;
  status: UnconnectedContactStatus;
  createdAt: string;
  messageCount: number;
  preview: string;
}

export interface AdminUnconnectedContactPage {
  contacts: AdminUnconnectedContactSummary[];
  total: number;
}

export interface AdminUnconnectedContact {
  id: string;
  publicId: string;
  email: string;
  identity: string;
  status: UnconnectedContactStatus;
  statusUpdatedAt: string;
  createdAt: string;
  messages: AdminUnconnectedContactMessage[];
}

function mintPublicId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function toContact(row: ContactRow): Omit<AdminUnconnectedContact, 'messages'> {
  return {
    id: row.id,
    publicId: row.public_id,
    email: decryptPii(row.email)!,
    identity: decryptPii(row.identity)!,
    status: row.status,
    statusUpdatedAt: row.status_updated_at,
    createdAt: row.created_at,
  };
}

export async function createUnconnectedContact(
  db: Pool,
  input: {
    email: string;
    identity: string;
    message: string;
    attachments: { fileName: string; originalName: string }[];
    /** The language the visitor wrote in, for the emailed reply. */
    language: Language;
  },
): Promise<AdminUnconnectedContact> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const id = randomUUID();
    let publicId = mintPublicId();
    let contact: ContactRow | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const { rows } = await client.query<ContactRow>(
          `insert into unconnected_contacts (id, public_id, email, email_lookup, identity, language)
           values ($1, $2, $3, $4, $5, $6) returning *`,
          [
            id,
            publicId,
            encryptPii(input.email),
            emailLookupHash(input.email),
            encryptPii(input.identity),
            input.language,
          ],
        );
        contact = rows[0];
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') throw error;
        publicId = mintPublicId();
      }
    }
    if (!contact) throw new Error('failed to mint unique unconnected contact public_id');
    const { rows: messages } = await client.query<MessageRow>(
      `insert into unconnected_contact_messages (contact_id, direction, body)
       values ($1, 'visitor', $2) returning *`,
      [id, encryptPii(input.message)],
    );
    const message = messages[0]!;
    const attachments: AdminUnconnectedContactAttachment[] = [];
    for (const attachment of input.attachments) {
      const { rows } = await client.query<AttachmentRow>(
        `insert into unconnected_contact_attachments (message_id, file_name, original_name)
         values ($1, $2, $3) returning *`,
        [message.id, encryptPii(attachment.fileName), encryptPii(attachment.originalName)],
      );
      attachments.push({ id: Number(rows[0]!.id), fileName: attachment.originalName });
    }
    await client.query('commit');
    return {
      ...toContact(contact),
      messages: [
        {
          id: Number(message.id),
          direction: 'visitor',
          body: input.message,
          createdAt: message.created_at,
          attachments,
        },
      ],
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Anonymous contact threads have no account FK because they were sent while
 * signed out. Their HMAC email lookup gives the admin customer page a safe,
 * exact-email history without decrypting or scanning the global inbox.
 */
export async function listUnconnectedContactsForEmailLookupPage(
  db: Pool,
  emailLookup: string,
  page: number,
  pageSize: number,
): Promise<AdminUnconnectedContactPage> {
  const offset = (page - 1) * pageSize;
  const [{ rows }, { rows: totals }] = await Promise.all([
    db.query<ContactRow & { message_count: string; preview: string }>(
      `select c.*, count(m.id)::text as message_count,
              (array_agg(m.body order by m.created_at asc))[1] as preview
       from unconnected_contacts c
       join unconnected_contact_messages m on m.contact_id = c.id
       where c.email_lookup = $1
       group by c.id
       order by c.created_at desc
       limit $2 offset $3`,
      [emailLookup, pageSize, offset],
    ),
    db.query<{ total: string }>(
      `select count(*)::text as total from unconnected_contacts where email_lookup = $1`,
      [emailLookup],
    ),
  ]);
  return {
    contacts: rows.map((row) => ({
      publicId: row.public_id,
      email: decryptPii(row.email)!,
      identity: decryptPii(row.identity)!,
      status: row.status,
      createdAt: row.created_at,
      messageCount: Number(row.message_count),
      preview: decryptPii(row.preview)?.slice(0, 160) ?? '',
    })),
    total: Number(totals[0]?.total ?? 0),
  };
}

/** Backfills the exact-email lookup introduced for the admin customer page.
 * Ciphertext cannot be HMACed in SQL on the managed PostgreSQL host, so the
 * operation migration handler runs this idempotent, bounded job after DDL. */
export async function backfillUnconnectedContactEmailLookups(db: Pool, batchSize = 500): Promise<number> {
  let filled = 0;
  for (;;) {
    const { rows } = await db.query<Pick<ContactRow, 'id' | 'email'>>(
      `select id, email from unconnected_contacts where email_lookup is null limit $1`,
      [batchSize],
    );
    if (rows.length === 0) return filled;

    const ids: string[] = [];
    const lookups: string[] = [];
    for (const row of rows) {
      const email = decryptPii(row.email);
      if (!email) continue;
      ids.push(row.id);
      lookups.push(emailLookupHash(email));
    }
    if (ids.length === 0) return filled;

    await db.query(
      `update unconnected_contacts c
         set email_lookup = source.lookup
        from (select unnest($1::uuid[]) as id, unnest($2::text[]) as lookup) as source
       where c.id = source.id`,
      [ids, lookups],
    );
    filled += ids.length;
    if (rows.length < batchSize) return filled;
  }
}

/** Count of unanswered contact-form threads for the admin-hub badge. */
export async function getAdminUnconnectedContactAttentionCounts(db: Pool): Promise<{ new: number }> {
  const { rows } = await db.query<{ new: string }>(
    `select count(*)::text as new from unconnected_contacts where status = 'new'`,
  );
  return { new: Number(rows[0]?.new ?? 0) };
}

export async function getUnconnectedContactByPublicId(
  db: Pool,
  publicId: string,
): Promise<AdminUnconnectedContact | undefined> {
  const { rows } = await db.query<ContactRow>('select * from unconnected_contacts where public_id = $1', [
    publicId,
  ]);
  const contact = rows[0];
  if (!contact) return undefined;
  const { rows: messages } = await db.query<MessageRow>(
    'select * from unconnected_contact_messages where contact_id = $1 order by created_at asc, id asc',
    [contact.id],
  );
  const { rows: attachments } = await db.query<AttachmentRow>(
    `select a.* from unconnected_contact_attachments a
     join unconnected_contact_messages m on m.id = a.message_id where m.contact_id = $1`,
    [contact.id],
  );
  const byMessage = new Map<string, AdminUnconnectedContactAttachment[]>();
  for (const attachment of attachments) {
    const list = byMessage.get(attachment.message_id) ?? [];
    list.push({ id: Number(attachment.id), fileName: decryptPii(attachment.original_name)! });
    byMessage.set(attachment.message_id, list);
  }
  return {
    ...toContact(contact),
    messages: messages.map((message) => ({
      id: Number(message.id),
      direction: message.direction,
      body: decryptPii(message.body)!,
      createdAt: message.created_at,
      attachments: byMessage.get(message.id) ?? [],
    })),
  };
}

export async function setUnconnectedContactStatus(
  db: Pool,
  publicId: string,
  status: UnconnectedContactStatus,
): Promise<AdminUnconnectedContact | undefined> {
  const { rows } = await db.query<ContactRow>(
    `update unconnected_contacts set status = $2, status_updated_at = now() where public_id = $1 returning *`,
    [publicId, status],
  );
  return rows[0] ? { ...toContact(rows[0]), messages: [] } : undefined;
}

export async function appendUnconnectedContactAdminReply(
  db: Pool,
  contactId: string,
  body: string,
  attachments: SavedPrivateImage[] = [],
): Promise<AdminUnconnectedContactMessage> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<MessageRow>(
      `insert into unconnected_contact_messages (contact_id, direction, body) values ($1, 'admin', $2) returning *`,
      [contactId, encryptPii(body)],
    );
    const message = rows[0]!;
    const publicAttachments: AdminUnconnectedContactAttachment[] = [];
    for (const attachment of attachments) {
      const { rows: attachmentRows } = await client.query<AttachmentRow>(
        `insert into unconnected_contact_attachments (message_id, file_name, original_name)
         values ($1, $2, $3) returning *`,
        [message.id, encryptPii(attachment.fileName), encryptPii(attachment.originalName)],
      );
      publicAttachments.push({ id: Number(attachmentRows[0]!.id), fileName: attachment.originalName });
    }
    await client.query(
      `update unconnected_contacts set status = 'answered', status_updated_at = now() where id = $1`,
      [contactId],
    );
    await client.query('commit');
    return {
      id: Number(message.id),
      direction: 'admin',
      body,
      createdAt: message.created_at,
      attachments: publicAttachments,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function findUnconnectedContactAttachment(
  db: Pool,
  contactId: string,
  attachmentId: number,
): Promise<{ fileName: string } | undefined> {
  const { rows } = await db.query<AttachmentRow>(
    `select a.* from unconnected_contact_attachments a
     join unconnected_contact_messages m on m.id = a.message_id
     where m.contact_id = $1 and a.id = $2`,
    [contactId, attachmentId],
  );
  return rows[0] ? { fileName: decryptPii(rows[0].file_name)! } : undefined;
}

/** The language to reply in: the one the visitor wrote in, French for
 * threads from before it was recorded. */
export async function unconnectedContactReplyLanguage(db: Pool, contactId: string): Promise<Language> {
  const { rows } = await db.query<{ language: string | null }>(
    `select language from unconnected_contacts where id = $1`,
    [contactId],
  );
  const language = rows[0]?.language;
  return language && isLanguage(language) ? language : 'fr';
}
