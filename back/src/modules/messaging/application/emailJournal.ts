import { config } from '../../../config/env.js';
import type { AdminEmailLogMetrics, AdminEmailLogTail } from '../../../contract/admin/emailLog.js';
import {
  appendEmailLog,
  clearEmailLogFiles,
  emailLogEnabled,
  type EmailLogKind,
} from '../../../platform/http/emailLog.js';
import { forEachPrivateLogLine } from '../../../platform/http/apiLog.js';

const KINDS = new Set<EmailLogKind>(['user', 'spy', 'contact', 'chat']);
const OUTCOMES = new Set(['sent', 'failed']);

export interface SentEmailNote {
  to: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: { filename: string }[];
}

function bodyText(text: string, html: string | undefined): string {
  if (text.trim()) return text;
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function errorText(error: unknown): string | null {
  if (error === undefined) return null;
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

/** Record one delivery. Never throws: the send result stays the caller's. */
export function noteSentEmail(
  message: SentEmailNote,
  subject: string,
  from: string | undefined,
  channel: 'smtp' | 'folder',
  outcome: 'sent' | 'failed',
  kind: EmailLogKind,
  error?: unknown,
): void {
  try {
    appendEmailLog({
      kind,
      channel,
      outcome,
      to: message.to,
      from: from ?? null,
      replyTo: message.replyTo ?? null,
      subject,
      text: bodyText(message.text, message.html),
      html: Boolean(message.html),
      attachmentNames: (message.attachments ?? []).map((item) => item.filename),
      error: errorText(error),
    });
  } catch (failure) {
    console.error('[email-log] record failed', failure);
  }
}

function text(value: unknown): string {
  if (Array.isArray(value)) return text(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

function boundLines(value: unknown): number {
  const requested = Number(Array.isArray(value) ? value[0] : (value ?? 100));
  return Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Counts every dated line. A line with no `at`, or a time after `nowMs`, is skipped. */
export function createEmailLogMetrics(nowMs: number) {
  const hourFrom = nowMs - HOUR_MS;
  const dayFrom = nowMs - DAY_MS;
  const weekFrom = nowMs - 7 * DAY_MS;
  const monthFrom = nowMs - 30 * DAY_MS;
  let hour = 0;
  let day = 0;
  let week = 0;
  let month = 0;
  return {
    push(line: string) {
      const atText = /"at":"([^"]*)"/.exec(line)?.[1] ?? '';
      if (!atText) return;
      const at = Date.parse(atText);
      if (Number.isNaN(at) || at > nowMs || at < monthFrom) return;
      month += 1;
      if (at < weekFrom) return;
      week += 1;
      if (at < dayFrom) return;
      day += 1;
      if (at < hourFrom) return;
      hour += 1;
    },
    finish(): AdminEmailLogMetrics {
      return { hour, day, week, month };
    },
  };
}

/** The preference gates writing. An administrator can still read whatever
 * file is already there. `q` is a case-insensitive substring of the raw line. */
export async function readAdminEmailLog(query: Record<string, unknown>): Promise<AdminEmailLogTail> {
  const limit = boundLines(query.lines);
  const kindText = text(query.kind);
  const outcomeText = text(query.outcome);
  const kind = KINDS.has(kindText as EmailLogKind) ? kindText : '';
  const outcome = OUTCOMES.has(outcomeText) ? outcomeText : '';
  const q = text(query.q).slice(0, 200).toLowerCase();
  const matches: string[] = [];
  const metrics = createEmailLogMetrics(Date.now());
  await forEachPrivateLogLine(config.emailLog.filePath, config.apiLog.rotateMaxFiles, (line) => {
    metrics.push(line);
    if (q && !line.toLowerCase().includes(q)) return;
    if (kind || outcome) {
      try {
        const parsed = JSON.parse(line) as { kind?: string; outcome?: string };
        if (kind && parsed.kind !== kind) return;
        if (outcome && parsed.outcome !== outcome) return;
      } catch {
        return;
      }
    }
    matches.push(line);
  });
  const truncated = matches.length > limit;
  return {
    enabled: emailLogEnabled(),
    lines: truncated ? matches.slice(-limit) : matches,
    truncated,
    metrics: metrics.finish(),
  };
}

export async function clearAdminEmailLog(): Promise<number> {
  return clearEmailLogFiles();
}
