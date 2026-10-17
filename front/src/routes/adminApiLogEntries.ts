/** One API diagnostic line the administration can read. */
export type ApiLogEntryView = {
  unreadable: boolean;
  at: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  target: string | null;
  queryText: string | null;
  requestHeadersText: string | null;
  requestBodyText: string | null;
  responseHeadersText: string | null;
  responseBodyText: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length > 0 ? JSON.stringify(value, null, 2) : null;
  if (typeof value === 'object') {
    if (Object.keys(value as object).length === 0) return null;
    return JSON.stringify(value, null, 2);
  }
  return null;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseOne(raw: string): ApiLogEntryView {
  const empty: ApiLogEntryView = {
    unreadable: true,
    at: null,
    method: null,
    path: null,
    status: null,
    durationMs: null,
    target: null,
    queryText: null,
    requestHeadersText: null,
    requestBodyText: null,
    responseHeadersText: null,
    responseBodyText: null,
  };
  try {
    const record = asRecord(JSON.parse(raw));
    if (!record) return empty;
    const request = asRecord(record.request);
    const response = asRecord(record.response);
    return {
      unreadable: false,
      at: stringOf(record.at),
      method: request ? stringOf(request.method) : null,
      path: request ? stringOf(request.path) : null,
      status: response ? numberOf(response.status) : null,
      durationMs: numberOf(record.durationMs),
      target: stringOf(record.target),
      queryText: request ? textOf(request.query) : null,
      requestHeadersText: request ? textOf(request.headers) : null,
      requestBodyText: request ? textOf(request.body) : null,
      responseHeadersText: response ? textOf(response.headers) : null,
      responseBodyText: response ? textOf(response.body) : null,
    };
  } catch {
    return empty;
  }
}

/** Newest call first. The file stores newest last. */
export function parseApiLogLines(lines: string[]): ApiLogEntryView[] {
  return [...lines].reverse().map(parseOne);
}

/** One page of a growing tail: page 1 is the newest `pageSize` calls. */
export function apiLogPageChunk(
  lines: string[],
  page: number,
  pageSize: number,
  maxLines: number,
): { rows: ApiLogEntryView[]; done: boolean } {
  const parsed = parseApiLogLines(lines);
  const start = (page - 1) * pageSize;
  const rows = parsed.slice(start, start + pageSize);
  const want = Math.min(page * pageSize, maxLines);
  const done = want >= maxLines || lines.length < want || rows.length < pageSize;
  return { rows, done };
}

export function formatApiLogDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
