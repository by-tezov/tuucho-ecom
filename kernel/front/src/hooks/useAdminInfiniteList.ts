import { useCallback, useEffect, useRef, useState } from 'react';

export interface AdminInfiniteChunk<Row> {
  rows: Row[];
  page: number;
  totalPages: number;
  /** Server-side count of matching records, for "12 / 340" indicators. */
  total?: number;
}

interface UseAdminInfiniteListOptions<Row> {
  /** Fetches one chunk. Memoize it: it is this list's reload trigger, so a
   * new identity restarts from the first chunk — which is exactly what a
   * changed filter or search should do. */
  fetchPage: (page: number) => Promise<AdminInfiniteChunk<Row>>;
  /** Shown as `error` when a fetch throws. */
  errorMessage: string;
  /** Skip loading entirely (e.g. no filter chosen yet). */
  enabled?: boolean;
}

/**
 * The one list behaviour every admin list uses: fetch a chunk, append the
 * next one when the viewport reaches the end, restart when the query changes.
 *
 * Replaces the hand-rolled page/totalPages/prev/next each admin page used to
 * carry. Rows accumulate here; `AdminInfiniteList` is what releases the ones
 * scrolled past, so a long list costs a bounded number of mounted rows rather
 * than a bounded number of fetched ones.
 *
 * `loading` is the first chunk only. An append sets `loadingMore` instead, so
 * a page can keep its blocking spinner on the former without covering the
 * rows the admin is already reading.
 */
export function useAdminInfiniteList<Row>({
  fetchPage,
  errorMessage,
  enabled = true,
}: UseAdminInfiniteListOptions<Row>) {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a chunk that resolves after its own list was replaced by a
  // newer filter: without it a slow first page can append onto the new list.
  const requestIdRef = useRef(0);

  const run = useCallback(
    async (nextPage: number, append: boolean) => {
      const requestId = (requestIdRef.current += 1);
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const chunk = await fetchPage(nextPage);
        if (requestId !== requestIdRef.current) return;
        setRows((current) => (append ? [...current, ...chunk.rows] : chunk.rows));
        setPage(chunk.page);
        setTotalPages(chunk.totalPages);
        setTotal(chunk.total ?? chunk.rows.length);
      } catch {
        if (requestId === requestIdRef.current) setError(errorMessage);
      } finally {
        // No `return` here: a control-flow statement in `finally` would
        // swallow whatever the try/catch decided. Guard the writes instead,
        // so a superseded request leaves the current one's flags alone.
        if (requestId === requestIdRef.current) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [errorMessage, fetchPage],
  );

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setRows([]);
      setPage(1);
      setTotalPages(0);
      setTotal(0);
      setLoading(false);
      return;
    }
    void run(1, false);
  }, [enabled, run]);

  /** Awaitable: a detail pane stepping past the last loaded record needs the
   * next chunk to be present before it can select the record after it. */
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;
    await run(page + 1, true);
  }, [loading, loadingMore, page, totalPages, run]);

  const reload = useCallback(() => void run(1, false), [run]);

  return {
    rows,
    setRows,
    page,
    totalPages,
    total,
    hasMore: page < totalPages,
    loading,
    loadingMore,
    error,
    setError,
    loadMore,
    reload,
  };
}
