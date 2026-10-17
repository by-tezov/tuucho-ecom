import { useEffect, useMemo, useState } from 'react';
import { AdminFilterSelect } from '../../components/admin/AdminFilterSelect';
import type { AdminInboxListFilter } from '../../api/admin/chats';
import { useLang } from '../../assets/i18n';
import { useAdminStrings } from '../../assets/i18n/admin';
import styles from '../AdminThreadPage.module.css';

type Period = NonNullable<AdminInboxListFilter['period']> | '';
type Sort = NonNullable<AdminInboxListFilter['sort']>;

export interface AdminInboxFiltersState {
  q: string;
  setQ: (value: string) => void;
  period: Period;
  setPeriod: (value: Period) => void;
  sort: Sort;
  setSort: (value: Sort) => void;
  /** What the list request sends; the search is debounced. Stable between
   * changes so it can sit in a fetch callback's dependencies. */
  query: AdminInboxListFilter;
  /** True when a search or a period narrows the list. */
  narrowed: boolean;
}

/** Search, period and sort of an admin inbox (chats, guest contacts). */
export function useAdminInboxFilters(): AdminInboxFiltersState {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('');
  const [sort, setSort] = useState<Sort>('activity');

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(q.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  const query = useMemo<AdminInboxListFilter>(
    () => ({ ...(search ? { q: search } : {}), ...(period ? { period } : {}), sort }),
    [search, period, sort],
  );
  return { q, setQ, period, setPeriod, sort, setSort, query, narrowed: Boolean(search || period) };
}

/** The filter card above an inbox list: same card, search field and
 * selectors as the administration journal. */
export function AdminInboxFilters({ id, state }: { id: string; state: AdminInboxFiltersState }) {
  const { t } = useLang();
  const a = useAdminStrings();
  return (
    <div className={styles.filters}>
      <div className={styles.filtersRow}>
        <div className={styles.searchField}>
          <label htmlFor={`${id}-q`}>{a.messages.searchLabel}</label>
          <input
            id={`${id}-q`}
            type="search"
            value={state.q}
            onChange={(event) => state.setQ(event.target.value)}
            placeholder={a.messages.searchPlaceholder}
            autoComplete="off"
          />
        </div>
        <AdminFilterSelect
          label={a.messages.periodLabel}
          options={[
            { value: '' as Period, label: a.messages.periodAll },
            { value: '7' as Period, label: a.messages.period7 },
            { value: '30' as Period, label: a.messages.period30 },
            { value: '90' as Period, label: a.messages.period90 },
            { value: '365' as Period, label: a.messages.period365 },
          ]}
          value={state.period}
          onChange={state.setPeriod}
          closeLabel={t.gallery.close}
        />
        <AdminFilterSelect
          label={a.messages.sortLabel}
          options={[
            { value: 'activity' as Sort, label: a.messages.sortActivity },
            { value: 'opened_desc' as Sort, label: a.messages.sortOpenedDesc },
            { value: 'opened_asc' as Sort, label: a.messages.sortOpenedAsc },
          ]}
          value={state.sort}
          onChange={state.setSort}
          closeLabel={t.gallery.close}
        />
      </div>
    </div>
  );
}
