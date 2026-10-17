import {
  isActivityCategory,
  isActivityOrigin,
  isActivityOutcome,
  type ActivityCategory,
  type ActivityOrigin,
} from '../domain/catalogue.js';
import { activityLogPath, clearActivityLogFile, readActivityLogLines } from '../infrastructure/activityLogFile.js';

export type ActivityEntry = {
  id: string;
  occurredAt: string;
  category: ActivityCategory;
  action: string;
  outcome: 'success' | 'failure';
  origin: ActivityOrigin;
  actorUserId: string | null;
  actorEmail: string | null;
  actorLabel: string;
  operatorUser: string | null;
  operatorHost: string | null;
  mode: string | null;
  sourceCommand: string | null;
  targetType: string | null;
  targetId: string | null;
  targets: string[];
  summary: string;
  detail: Record<string, unknown>;
};

export type ActivityListQuery = {
  page?: number | string;
  pageSize?: number | string;
  category?: unknown;
  origin?: unknown;
  actorUserId?: unknown;
  q?: unknown;
};

const ACTOR_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** A stored line that is not a journal record is skipped. */
export function parseActivityLogLine(line: string): ActivityEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.occurredAt !== 'string' || !row.occurredAt) return null;
  if (!isActivityCategory(row.category) || !isActivityOrigin(row.origin) || !isActivityOutcome(row.outcome)) {
    return null;
  }
  if (typeof row.action !== 'string' || typeof row.summary !== 'string' || typeof row.actorLabel !== 'string') {
    return null;
  }
  const targets = Array.isArray(row.targets) ? row.targets.filter((item): item is string => typeof item === 'string') : [];
  const detail =
    row.detail && typeof row.detail === 'object' && !Array.isArray(row.detail)
      ? (row.detail as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    category: row.category,
    action: row.action,
    outcome: row.outcome,
    origin: row.origin,
    actorUserId: textOrNull(row.actorUserId),
    actorEmail: textOrNull(row.actorEmail),
    actorLabel: row.actorLabel,
    operatorUser: textOrNull(row.operatorUser),
    operatorHost: textOrNull(row.operatorHost),
    mode: textOrNull(row.mode),
    sourceCommand: textOrNull(row.sourceCommand),
    targetType: textOrNull(row.targetType),
    targetId: textOrNull(row.targetId),
    targets,
    summary: row.summary,
    detail,
  };
}

function matchesQuery(
  entry: ActivityEntry,
  query: { category?: ActivityCategory; origin?: ActivityOrigin; actorUserId?: string; q?: string },
): boolean {
  if (query.category && entry.category !== query.category) return false;
  if (query.origin && entry.origin !== query.origin) return false;
  if (query.actorUserId && entry.actorUserId !== query.actorUserId) return false;
  const needle = query.q?.trim().toLowerCase() ?? '';
  if (!needle) return true;
  if (entry.summary.toLowerCase().includes(needle)) return true;
  if ((entry.targetId ?? '').toLowerCase().includes(needle)) return true;
  return entry.targets.some((target) => target.toLowerCase().includes(needle));
}

function byNewest(a: ActivityEntry, b: ActivityEntry): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Newest first, then a page. Filters match the administration journal. */
export function queryActivityEntries(
  entries: readonly ActivityEntry[],
  raw: ActivityListQuery,
): { entries: ActivityEntry[]; total: number; page: number; pageSize: number } {
  const page = Math.max(1, Number(raw.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(raw.pageSize) || 30));
  const category = isActivityCategory(raw.category) ? raw.category : undefined;
  let origin = isActivityOrigin(raw.origin) ? raw.origin : undefined;
  const actorRaw = typeof raw.actorUserId === 'string' ? raw.actorUserId : '';
  const actorUserId = ACTOR_ID.test(actorRaw) ? actorRaw : undefined;
  if (actorUserId) origin = 'admin';
  const q = typeof raw.q === 'string' ? raw.q.trim().slice(0, 200) : undefined;
  const matched = entries
    .filter((entry) => matchesQuery(entry, { category, origin, actorUserId, q }))
    .sort(byNewest);
  const start = (page - 1) * pageSize;
  return { entries: matched.slice(start, start + pageSize), total: matched.length, page, pageSize };
}

/** Administrators that appear in the file, newest email for each account. */
export function activityActors(entries: readonly ActivityEntry[]): { userId: string; email: string }[] {
  const byId = new Map<string, { email: string; at: string }>();
  for (const entry of entries) {
    if (entry.origin !== 'admin' || !entry.actorUserId) continue;
    const previous = byId.get(entry.actorUserId);
    if (previous && previous.at >= entry.occurredAt) continue;
    byId.set(entry.actorUserId, {
      email: entry.actorEmail || entry.actorLabel,
      at: entry.occurredAt,
    });
  }
  return [...byId.entries()]
    .map(([userId, value]) => ({ userId, email: value.email }))
    .sort((a, b) => a.email.localeCompare(b.email) || a.userId.localeCompare(b.userId));
}

function entriesFromLines(lines: readonly string[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const line of lines) {
    const entry = parseActivityLogLine(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

export async function listActivity(
  raw: ActivityListQuery,
): Promise<{ entries: ActivityEntry[]; total: number; page: number; pageSize: number }> {
  const lines = await readActivityLogLines(activityLogPath());
  return queryActivityEntries(entriesFromLines(lines), raw);
}

export async function listActivityActors(): Promise<{ userId: string; email: string }[]> {
  const lines = await readActivityLogLines(activityLogPath());
  return activityActors(entriesFromLines(lines));
}

export function clearActivityLog(): Promise<number> {
  return clearActivityLogFile(activityLogPath());
}
