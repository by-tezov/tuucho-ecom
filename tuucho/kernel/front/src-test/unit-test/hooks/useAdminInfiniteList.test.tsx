import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAdminInfiniteList, type AdminInfiniteChunk } from '@/hooks/useAdminInfiniteList';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const chunk = (page: number, rows: string[], totalPages = 2): AdminInfiniteChunk<string> => ({
  rows,
  page,
  totalPages,
  total: 4,
});

describe('useAdminInfiniteList', () => {
  it('loads the first chunk, then appends the next one without the blocking flag', async () => {
    const fetchPage = vi.fn(async (page: number) => chunk(page, [`r${page}a`, `r${page}b`]));
    const { result } = renderHook(() => useAdminInfiniteList({ fetchPage, errorMessage: 'failed' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ rows: ['r1a', 'r1b'], hasMore: true, total: 4 });

    await act(() => result.current.loadMore());
    expect(result.current.rows).toEqual(['r1a', 'r1b', 'r2a', 'r2b']);
    expect(result.current.hasMore).toBe(false);

    await act(() => result.current.loadMore());
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('drops a slow chunk from a query that was replaced meanwhile', async () => {
    const slow = deferred<AdminInfiniteChunk<string>>();
    const oldQuery = vi.fn(() => slow.promise);
    const newQuery = vi.fn(async () => chunk(1, ['new'], 1));
    const { result, rerender } = renderHook(
      ({ fetchPage }) => useAdminInfiniteList({ fetchPage, errorMessage: 'failed' }),
      { initialProps: { fetchPage: oldQuery as (page: number) => Promise<AdminInfiniteChunk<string>> } },
    );

    rerender({ fetchPage: newQuery });
    await waitFor(() => expect(result.current.rows).toEqual(['new']));

    await act(async () => slow.resolve(chunk(1, ['stale'], 1)));
    expect(result.current.rows).toEqual(['new']);
    expect(result.current.loading).toBe(false);
  });

  it('reports the configured error and clears loading when a fetch fails', async () => {
    const fetchPage = vi.fn(async () => {
      throw new Error('500');
    });
    const { result } = renderHook(() => useAdminInfiniteList({ fetchPage, errorMessage: 'Could not load' }));
    await waitFor(() => expect(result.current.error).toBe('Could not load'));
    expect(result.current.loading).toBe(false);
  });

  it('stays idle and empty while disabled', () => {
    const fetchPage = vi.fn(async () => chunk(1, ['x']));
    const { result } = renderHook(() =>
      useAdminInfiniteList({ fetchPage, errorMessage: 'e', enabled: false }),
    );
    expect(fetchPage).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ rows: [], loading: false, hasMore: false });
  });
});
