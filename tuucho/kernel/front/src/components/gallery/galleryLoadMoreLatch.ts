/** Pure state machine behind GalleryGrid's load-more latch, extracted so the
 * scroll-trigger effect stays a thin adapter and the transitions are unit
 * testable without rendering a virtualized grid.
 *
 * The latch exists because appending a page remounts/re-measures rows: without
 * it the effect could re-request pages on every render while the same last
 * row stayed rendered. It only survives while a fetch is in flight at the
 * grid's end — it re-arms when the visitor leaves the end, and when the
 * in-flight page finishes (`loadingMore` falls). The appended rows then sit
 * below the viewport, so a parked visitor still triggers the next page once
 * the new end scrolls in instead of being stuck on page 2 forever. */
export function nextGalleryLoadMoreLatch(state: {
  latched: boolean;
  /** The last virtual row rendered is the grid's last row. */
  atEnd: boolean;
  hasMore: boolean;
  loadingMore: boolean;
}): { latched: boolean; fire: boolean } {
  const latched = state.atEnd && state.loadingMore ? state.latched : false;
  if (!state.atEnd) return { latched, fire: false };
  if (!state.hasMore || state.loadingMore || latched) return { latched, fire: false };
  return { latched: true, fire: true };
}
