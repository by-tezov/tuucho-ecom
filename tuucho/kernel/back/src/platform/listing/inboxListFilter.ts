/** Filters shared by the administration inboxes (registered-customer chats,
 * guest contact messages): free-text search, opening period and sort. Pure:
 * the HTTP layer parses the query string, each list query applies it. */

export const INBOX_LIST_PERIODS = ['7', '30', '90', '365'] as const;
export type InboxListPeriod = (typeof INBOX_LIST_PERIODS)[number];

export const INBOX_LIST_SORTS = ['activity', 'opened_desc', 'opened_asc'] as const;
export type InboxListSort = (typeof INBOX_LIST_SORTS)[number];

const SEARCH_MAX = 100;

export type InboxListFilter = {
  /** Free text matched against e-mail, name, public id and messages. */
  search: string | null;
  /** Only threads opened within this many days. */
  openedWithinDays: number | null;
  sort: InboxListSort;
};

export function parseInboxListFilter(query: { q?: unknown; period?: unknown; sort?: unknown }): InboxListFilter {
  const raw = typeof query.q === 'string' ? query.q.replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX) : '';
  const period = (INBOX_LIST_PERIODS as readonly unknown[]).includes(query.period)
    ? Number(query.period as InboxListPeriod)
    : null;
  const sort = (INBOX_LIST_SORTS as readonly unknown[]).includes(query.sort) ? (query.sort as InboxListSort) : 'activity';
  return { search: raw.length > 0 ? raw : null, openedWithinDays: period, sort };
}

/** `ILIKE` pattern matching `text` literally anywhere (`%` and `_` escaped). */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
