/** One private cron journal the administration can open. */
export type CronLogChip = { key: string; value: unknown };

export type CronLogEntryView = {
  ok: boolean;
  at: string | null;
  error: string | null;
  chips: CronLogChip[];
  unreadable: boolean;
};

const SKIP = new Set(['success', 'error', 'at']);

function pushChip(chips: CronLogChip[], key: string, value: unknown): void {
  // A normal tracking run is not a skip. Showing "skipped: no" on every
  // hour hides the counters that say what the run actually did.
  if (key === 'skipped' && value === false) return;
  chips.push({ key, value });
}

function flattenChips(record: Record<string, unknown>): CronLogChip[] {
  const chips: CronLogChip[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (SKIP.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue && typeof innerValue === 'object') continue;
        pushChip(chips, innerKey, innerValue);
      }
      continue;
    }
    if (Array.isArray(value)) continue;
    pushChip(chips, key, value);
  }
  return chips;
}

function parseOne(raw: string): CronLogEntryView {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, at: null, error: null, chips: [], unreadable: true };
    }
    const record = parsed as Record<string, unknown>;
    const at = typeof record.at === 'string' && record.at ? record.at : null;
    const error = typeof record.error === 'string' && record.error ? record.error : null;
    return {
      ok: record.success !== false && !error,
      at,
      error,
      chips: flattenChips(record),
      unreadable: false,
    };
  } catch {
    return { ok: false, at: null, error: null, chips: [], unreadable: true };
  }
}

/** Newest run first. The file stores newest last. */
export function parseCronLogLines(lines: string[]): CronLogEntryView[] {
  return [...lines].reverse().map(parseOne);
}

/** One page of a growing tail: page 1 is the newest `pageSize` runs. */
export function cronLogPageChunk(
  lines: string[],
  page: number,
  pageSize: number,
  maxLines: number,
): { rows: CronLogEntryView[]; done: boolean } {
  const parsed = parseCronLogLines(lines);
  const start = (page - 1) * pageSize;
  const rows = parsed.slice(start, start + pageSize);
  const want = Math.min(page * pageSize, maxLines);
  const done = want >= maxLines || lines.length < want || rows.length < pageSize;
  return { rows, done };
}
