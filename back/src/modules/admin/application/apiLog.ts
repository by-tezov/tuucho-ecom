import { config } from '../../../config/env.js';
import type { AdminApiLogTail } from '../../../contract/admin/apiLog.js';
import { apiLogEnabled, clearApiLogFiles, forEachPrivateLogLine } from '../../../platform/http/apiLog.js';
import { createApiLogCollector, createApiLogMetrics, type ApiLogFilter } from './apiLogFilter.js';
import { boundCronLogLines } from './cronLogs.js';

const MAX_CONTENT = 200;
const MAX_ROUTE = 500;

function text(value: unknown): string {
  if (Array.isArray(value)) return text(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

/** A calendar day is that UTC day. A full timestamp is used as given. */
function instantMs(value: string, edge: 'start' | 'end'): number | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`
    : value;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function filterFromQuery(query: Record<string, unknown>): { limit: number; filter: ApiLogFilter } {
  const content = text(query.q).slice(0, MAX_CONTENT);
  const route = text(query.route).slice(0, MAX_ROUTE);
  return {
    limit: boundCronLogLines(query.lines),
    filter: {
      route,
      fromMs: instantMs(text(query.from), 'start'),
      toMs: instantMs(text(query.to), 'end'),
      content,
    },
  };
}

/** The preference gates writing. An administrator can still read and erase
 * whatever file is already there. Filters apply to the current file and
 * every rotated generation. */
export async function readAdminApiLog(query: Record<string, unknown> = {}): Promise<AdminApiLogTail> {
  const { limit, filter } = filterFromQuery(query);
  const collector = createApiLogCollector(filter, limit);
  const metrics = createApiLogMetrics(Date.now());
  await forEachPrivateLogLine(config.apiLog.filePath, config.apiLog.rotateMaxFiles, (line) => {
    collector.push(line);
    metrics.push(line);
  });
  return { enabled: apiLogEnabled(), ...collector.finish(), metrics: metrics.finish() };
}

export async function clearAdminApiLog(): Promise<number> {
  return clearApiLogFiles();
}
