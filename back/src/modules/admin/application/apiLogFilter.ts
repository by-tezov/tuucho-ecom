/** How an administrator narrows the API journal. */
export type ApiLogFilter = {
  /** Exact request path. Empty means every route. */
  route: string;
  fromMs: number | null;
  toMs: number | null;
  /** Case-insensitive content search. `*` matches any text, including none. */
  content: string;
};

const MAX_CONTENT = 200;
const MAX_ROUTES = 400;

export function readApiLogLineMeta(line: string): { at: string | null; path: string | null } {
  const at = /"at":"([^"]*)"/.exec(line)?.[1] ?? '';
  const path = /"path":"([^"]*)"/.exec(line)?.[1] ?? '';
  return { at: at || null, path: path || null };
}

/** `*` is the only wildcard. Anything else, including `.` and `?`, is literal. */
export function apiLogContentMatches(text: string, pattern: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return true;
  if (trimmed.length > MAX_CONTENT) return false;
  const hay = text.toLowerCase();
  const pat = trimmed.toLowerCase();
  if (!pat.includes('*')) return hay.includes(pat);
  const parts = pat.split('*');
  let from = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? '';
    const last = index === parts.length - 1;
    if (index === 0) {
      if (part === '') continue;
      if (!hay.startsWith(part)) return false;
      from = part.length;
      continue;
    }
    if (last) {
      if (part === '') return true;
      return hay.slice(from).endsWith(part);
    }
    if (part === '') continue;
    const found = hay.indexOf(part, from);
    if (found < 0) return false;
    from = found + part.length;
  }
  return true;
}

export function apiLogLineMatches(line: string, filter: ApiLogFilter): boolean {
  if (!apiLogContentMatches(line, filter.content)) return false;
  const meta = readApiLogLineMeta(line);
  if (filter.route && meta.path !== filter.route) return false;
  if (filter.fromMs === null && filter.toMs === null) return true;
  if (!meta.at) return false;
  const at = Date.parse(meta.at);
  if (Number.isNaN(at)) return false;
  if (filter.fromMs !== null && at < filter.fromMs) return false;
  if (filter.toMs !== null && at > filter.toMs) return false;
  return true;
}

/** Push lines oldest first. `finish` keeps the newest `limit` matches. */
export function createApiLogCollector(filter: ApiLogFilter, limit: number) {
  const cap = Math.max(1, limit);
  const ring = Array.from({ length: cap }, () => '');
  let count = 0;
  let write = 0;
  const routes = new Set<string>();
  const rangeInvalid = filter.fromMs !== null && filter.toMs !== null && filter.fromMs > filter.toMs;
  return {
    push(line: string) {
      const path = readApiLogLineMeta(line).path;
      if (path && routes.size < MAX_ROUTES) routes.add(path);
      if (rangeInvalid || !apiLogLineMatches(line, filter)) return;
      ring[write] = line;
      write = (write + 1) % cap;
      count += 1;
    },
    finish(): { lines: string[]; routes: string[]; truncated: boolean } {
      const lines = count <= cap ? ring.slice(0, count) : [...ring.slice(write), ...ring.slice(0, write)];
      return {
        lines,
        routes: [...routes].sort((a, b) => a.localeCompare(b)),
        truncated: count > cap,
      };
    },
  };
}

const TOP_ROUTES = 10;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ApiLogRouteCount = { path: string; count: number };

export type ApiLogWindowMetrics = { requests: number; top: ApiLogRouteCount[] };

/** Rolling windows ending at the read: 1 hour, 24 hours, 7 times 24 hours, 30 times 24 hours. */
export type ApiLogMetrics = {
  hour: ApiLogWindowMetrics;
  day: ApiLogWindowMetrics;
  week: ApiLogWindowMetrics;
  month: ApiLogWindowMetrics;
};

function rankRoutes(counts: Map<string, number>): ApiLogRouteCount[] {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, TOP_ROUTES)
    .map(([path, count]) => ({ path, count }));
}

/** Call totals omit `/healthz`. Route rankings keep it. A line with no `at`, or a time after `nowMs`, is skipped. */
export function createApiLogMetrics(nowMs: number) {
  const hourFrom = nowMs - HOUR_MS;
  const dayFrom = nowMs - DAY_MS;
  const weekFrom = nowMs - 7 * DAY_MS;
  const monthFrom = nowMs - 30 * DAY_MS;
  const hour = new Map<string, number>();
  const day = new Map<string, number>();
  const week = new Map<string, number>();
  const month = new Map<string, number>();
  let hourRequests = 0;
  let dayRequests = 0;
  let weekRequests = 0;
  let monthRequests = 0;

  function add(counts: Map<string, number>, path: string | null, requests: number): number {
    if (path) counts.set(path, (counts.get(path) ?? 0) + 1);
    return path?.endsWith('/healthz') ? requests : requests + 1;
  }

  return {
    push(line: string) {
      const meta = readApiLogLineMeta(line);
      if (!meta.at) return;
      const at = Date.parse(meta.at);
      if (Number.isNaN(at) || at > nowMs || at < monthFrom) return;
      monthRequests = add(month, meta.path, monthRequests);
      if (at < weekFrom) return;
      weekRequests = add(week, meta.path, weekRequests);
      if (at < dayFrom) return;
      dayRequests = add(day, meta.path, dayRequests);
      if (at < hourFrom) return;
      hourRequests = add(hour, meta.path, hourRequests);
    },
    finish(): ApiLogMetrics {
      return {
        hour: { requests: hourRequests, top: rankRoutes(hour) },
        day: { requests: dayRequests, top: rankRoutes(day) },
        week: { requests: weekRequests, top: rankRoutes(week) },
        month: { requests: monthRequests, top: rankRoutes(month) },
      };
    },
  };
}
