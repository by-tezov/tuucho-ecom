import type { Pool, PoolClient } from 'pg';
import type { ChatSessionRow } from '../domain/chatTypes.js';
import { containsPattern, type InboxListFilter } from '../../../platform/listing/inboxListFilter.js';

type ListedSession = ChatSessionRow & { message_count: number; last_message_body: string | null };

const ORDER_BY: Record<InboxListFilter['sort'], string> = {
  activity: 'coalesce(s.last_message_at, s.created_at) desc, s.id',
  opened_desc: 's.created_at desc, s.id',
  opened_asc: 's.created_at asc, s.id',
};

/** One status of the administration inbox, filtered and paginated. The
 * search reads columns stored in clear (`visitor_email`, `visitor_identity`,
 * `public_id`, message bodies) and is bounded to 100 characters upstream. */
export async function listAdminSessionsPage(
  db: Pool | PoolClient,
  status: ChatSessionRow['status'],
  filter: InboxListFilter,
  page: number,
  pageSize: number,
): Promise<{ sessions: ListedSession[]; total: number }> {
  const conditions = ['s.status = $1'];
  const values: unknown[] = [status];
  if (filter.search) {
    values.push(containsPattern(filter.search));
    const p = `$${values.length}`;
    conditions.push(
      `(s.visitor_email ilike ${p} or s.visitor_identity ilike ${p} or s.public_id ilike ${p}
        or exists (select 1 from chat_messages m where m.session_id = s.id and m.body ilike ${p}))`,
    );
  }
  if (filter.openedWithinDays !== null) {
    values.push(filter.openedWithinDays);
    conditions.push(`s.created_at >= now() - make_interval(days => $${values.length})`);
  }
  const where = conditions.join(' and ');
  const [count, result] = await Promise.all([
    db.query<{ count: string }>(`select count(*)::text from chat_sessions s where ${where}`, values),
    db.query<ListedSession>(
      `select s.*,
              (select count(*)::int from chat_messages m where m.session_id = s.id) as message_count,
              (select body from chat_messages m where m.session_id = s.id order by m.id desc limit 1) as last_message_body
         from chat_sessions s
        where ${where}
        order by ${ORDER_BY[filter.sort]}
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    ),
  ]);
  return { sessions: result.rows, total: Number(count.rows[0]?.count ?? 0) };
}
