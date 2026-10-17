/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/admin/apiLog.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

export interface AdminApiLogRouteCount {
  path: string;
  count: number;
}

export interface AdminApiLogWindow {
  /** Calls whose `at` falls in this rolling window. */
  requests: number;
  /** At most 10 paths, highest count first. */
  top: AdminApiLogRouteCount[];
}

/** Rolling windows ending when the journal is read. */
export interface AdminApiLogMetrics {
  /** Last hour. */
  hour: AdminApiLogWindow;
  /** Last 24 hours. */
  day: AdminApiLogWindow;
  /** Last 7 times 24 hours. */
  week: AdminApiLogWindow;
  /** Last 30 times 24 hours. */
  month: AdminApiLogWindow;
}

/** Newest last among the lines that matched. */
export interface AdminApiLogTail {
  /** False whenever the write preference is off. */
  enabled: boolean;
  lines: string[];
  /** Distinct request paths seen while scanning, sorted, at most 400. */
  routes: string[];
  /** True when more than `lines` matches existed. The newest are kept. */
  truncated: boolean;
  /** Counts every dated line in the scan, not only the filtered page. */
  metrics: AdminApiLogMetrics;
}
