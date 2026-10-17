import type { Pool } from 'pg';
import type { Rows } from '@kernel/back/db/rows';
import { decryptPii, emailLookupHash } from '@kernel/back/platform/security/piiCrypto';
import { containsPattern, type InboxListFilter } from '@kernel/back/platform/listing/inboxListFilter';
import type {
  AdminUnconnectedContactPage,
  AdminUnconnectedContactSummary,
  UnconnectedContactStatus,
} from './unconnectedContact.js';

/** Most recent rows of one tab (and period) decrypted for a text search.
 * E-mail, name and messages are encrypted at rest, so a partial search runs
 * over this bounded window in memory; an exact e-mail (HMAC lookup) or a
 * public-id match is always ranked into the window first. */
export const CONTACT_SEARCH_WINDOW = 2000;

type ListedRow = Pick<Rows['unconnected_contacts'], 'public_id' | 'email' | 'identity' | 'status' | 'created_at'> & {
  message_count: string;
  first_body: string | null;
  last_message_at: string;
};

type SearchRow = ListedRow & { bodies: string[]; exact: boolean };

const ORDER_BY: Record<InboxListFilter['sort'], string> = {
  activity: 'last_message_at desc, c.id',
  opened_desc: 'c.created_at desc, c.id',
  opened_asc: 'c.created_at asc, c.id',
};

function toSummary(row: ListedRow): AdminUnconnectedContactSummary {
  return {
    publicId: row.public_id,
    email: decryptPii(row.email)!,
    identity: decryptPii(row.identity)!,
    status: row.status as UnconnectedContactStatus,
    createdAt: row.created_at,
    messageCount: Number(row.message_count),
    preview: decryptPii(row.first_body)?.slice(0, 160) ?? '',
  };
}

/** One status of the guest contact inbox, filtered and paginated. */
export async function listAdminUnconnectedContactsPage(
  db: Pool,
  status: UnconnectedContactStatus,
  filter: InboxListFilter,
  page: number,
  pageSize: number,
): Promise<AdminUnconnectedContactPage> {
  const values: unknown[] = [status];
  let where = 'c.status = $1';
  if (filter.openedWithinDays !== null) {
    values.push(filter.openedWithinDays);
    where += ` and c.created_at >= now() - make_interval(days => $${values.length})`;
  }
  const select = `select c.public_id, c.email, c.identity, c.status, c.created_at,
            count(m.id)::text as message_count,
            (array_agg(m.body order by m.created_at asc))[1] as first_body,
            max(m.created_at) as last_message_at`;

  if (!filter.search) {
    const [{ rows }, { rows: totals }] = await Promise.all([
      db.query<ListedRow>(
        `${select}
           from unconnected_contacts c join unconnected_contact_messages m on m.contact_id = c.id
          where ${where} group by c.id order by ${ORDER_BY[filter.sort]}
          limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
      db.query<{ total: string }>(`select count(*)::text as total from unconnected_contacts c where ${where}`, values),
    ]);
    return { contacts: rows.map(toSummary), total: Number(totals[0]?.total ?? 0) };
  }

  const needle = filter.search.toLocaleLowerCase();
  values.push(emailLookupHash(filter.search), containsPattern(filter.search));
  const exact = `(c.email_lookup = $${values.length - 1} or c.public_id ilike $${values.length})`;
  const { rows } = await db.query<SearchRow>(
    `${select}, array_agg(m.body) as bodies, bool_or(${exact}) as exact
       from unconnected_contacts c join unconnected_contact_messages m on m.contact_id = c.id
      where ${where} group by c.id
      order by bool_or(${exact}) desc, ${ORDER_BY[filter.sort]}
      limit ${CONTACT_SEARCH_WINDOW}`,
    values,
  );
  const matches = rows
    .filter((row) => {
      if (row.exact) return true;
      const texts = [row.email, row.identity, ...row.bodies].map((value) => decryptPii(value) ?? '');
      return texts.some((text) => text.toLocaleLowerCase().includes(needle));
    })
    .sort(compareBy(filter.sort));
  const start = (page - 1) * pageSize;
  return { contacts: matches.slice(start, start + pageSize).map(toSummary), total: matches.length };
}

/** The window is ranked exact matches first; restore the requested order. */
function compareBy(sort: InboxListFilter['sort']) {
  const time = (value: string) => new Date(value).getTime();
  return (left: SearchRow, right: SearchRow): number => {
    if (sort === 'opened_asc') return time(left.created_at) - time(right.created_at);
    if (sort === 'opened_desc') return time(right.created_at) - time(left.created_at);
    return time(right.last_message_at) - time(left.last_message_at);
  };
}
