/** Rolling counts ending when the journal is read. */
export interface AdminEmailLogMetrics {
  /** Last hour. */
  hour: number;
  /** Last 24 hours. */
  day: number;
  /** Last 7 times 24 hours. */
  week: number;
  /** Last 30 times 24 hours. */
  month: number;
}

/** Tail of the private sent-mail journal. `lines` are oldest first. */
export interface AdminEmailLogTail {
  enabled: boolean;
  lines: string[];
  truncated: boolean;
  /** Every dated line in the scan, not only the filtered page. */
  metrics: AdminEmailLogMetrics;
}
