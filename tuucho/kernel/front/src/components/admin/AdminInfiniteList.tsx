import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import styles from './AdminInfiniteList.module.css';

/** A typical admin row is one line of text plus a 48px thumbnail. The virtualizer
 * corrects this per row via measureElement; it only has to be close enough
 * that the initial scrollbar is not wildly wrong. */
const ESTIMATED_ROW_HEIGHT = 74;
const OVERSCAN = 6;

interface AdminInfiniteListProps {
  count: number;
  renderRow: (index: number) => ReactNode;
  rowKey: (index: number) => string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  label: string;
  /** Container styling (card background, border, radius). The list owns only
   * the row dividers and the virtual positioning. */
  className?: string | undefined;
  /** Rows carry a bottom divider. Off for lists that draw their own. */
  dividers?: boolean | undefined;
  /** Card lists: lay rows out in as many columns of at least this width as
   * the container fits, with `CARD_GAP` between cards. Omit for a plain
   * one-row-per-line list. */
  cardMinWidth?: number | undefined;
}

/** Space between cards, both directions, in card mode. */
const CARD_GAP = 10;

/**
 * Window-virtualized admin list: rows off screen are unmounted, and reaching
 * the end of the rendered range asks for the next page.
 *
 * Same two mechanisms as the gallery grid, for the same reasons — see
 * GalleryGrid.tsx. Rows are released as they leave the viewport so a long
 * list does not accumulate thousands of mounted rows, and the load-more
 * trigger is the virtualizer's own rendered range rather than a separate
 * sentinel element.
 *
 * Pairs with useAdminInfiniteList, which owns the fetching.
 */
export function AdminInfiniteList({
  count,
  renderRow,
  rowKey,
  hasMore,
  loadingMore,
  onLoadMore,
  label,
  className,
  dividers = true,
  cardMinWidth,
}: AdminInfiniteListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [parentOffset, setParentOffset] = useState(0);
  const [lanes, setLanes] = useState(1);

  useLayoutEffect(() => {
    const node = parentRef.current;
    if (!node || !cardMinWidth) return;
    const measure = () =>
      setLanes(Math.max(1, Math.floor((node.clientWidth + CARD_GAP) / (cardMinWidth + CARD_GAP))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cardMinWidth]);

  useLayoutEffect(() => {
    const node = parentRef.current;
    if (!node) return;
    const measure = () => setParentOffset(node.getBoundingClientRect().top + window.scrollY);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin: parentOffset,
    lanes,
  });
  // A row's real height arrives after its first paint; adjusting window
  // scroll for that would move rows out from under the pointer mid-edit.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

  const virtualRows = virtualizer.getVirtualItems();
  const lastIndex = virtualRows[virtualRows.length - 1]?.index;
  const loadMoreLatchedRef = useRef(false);

  const requestMore = useCallback(() => {
    // Appending a page re-measures rows while the same last row stays
    // rendered. Without the latch this effect would request every remaining
    // page in one burst.
    loadMoreLatchedRef.current = true;
    onLoadMore();
  }, [onLoadMore]);

  useEffect(() => {
    if (lastIndex === undefined || lastIndex < count - 1) {
      loadMoreLatchedRef.current = false;
      return;
    }
    if (!hasMore || loadingMore || loadMoreLatchedRef.current) return;
    requestMore();
  }, [lastIndex, count, hasMore, loadingMore, requestMore]);

  return (
    <div ref={parentRef} role="list" aria-label={label} className={className}>
      <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => (
          <div
            key={rowKey(virtualRow.index)}
            role="listitem"
            className={[dividers && styles.row, dividers && virtualRow.index === count - 1 && styles.rowLast]
              .filter(Boolean)
              .join(' ')}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              // Card mode: one column per lane, the gap carried as padding so
              // measureElement includes it in the row height.
              left: cardMinWidth
                ? `calc(${virtualRow.lane} * ((100% - ${(lanes - 1) * CARD_GAP}px) / ${lanes} + ${CARD_GAP}px))`
                : 0,
              width: cardMinWidth ? `calc((100% - ${(lanes - 1) * CARD_GAP}px) / ${lanes})` : '100%',
              paddingBottom: cardMinWidth ? CARD_GAP : undefined,
              boxSizing: 'border-box',
              transform: `translateY(${virtualRow.start - parentOffset}px)`,
            }}
          >
            {renderRow(virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
