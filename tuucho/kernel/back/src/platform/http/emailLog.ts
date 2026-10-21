import { mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../../config/env.js';
import { isEmailLogPreferenceEnabled } from '../../modules/settings/application/appPreferences.js';
import { redactForLog, type LogRedaction } from './apiLogSerialization.js';

/**
 * Rotating NDJSON journal of mail that left the process. A write failure is
 * logged and swallowed: recording a message must never decide whether it
 * was sent. Production uses the same anonymous redaction as the API journal,
 * except an email that belongs to an account is stored as that user's id.
 */
const MAX_LOOKUP_EMAILS = 32;

function emailPattern(): RegExp {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
}

type EmailUserLookup = (emails: readonly string[]) => Promise<ReadonlyMap<string, string>>;

let userLookup: EmailUserLookup | null = null;

/** Registered once from the API assembly root. Unset, production still
 * redacts every address and never writes one in the clear. */
export function registerEmailLogUserLookup(lookup: EmailUserLookup): void {
  userLookup = lookup;
}

const TEXT_MAX_BYTES = 32 * 1024;

export type EmailLogKind = 'user' | 'spy' | 'contact' | 'chat';

export interface EmailLogDraft {
  kind: EmailLogKind;
  channel: 'smtp' | 'folder';
  outcome: 'sent' | 'failed';
  to: string;
  from: string | null;
  replyTo: string | null;
  subject: string;
  text: string;
  html: boolean;
  attachmentNames: string[];
  error: string | null;
}

let writeQueue: Promise<void> = Promise.resolve();

export function emailLogEnabled(): boolean {
  return isEmailLogPreferenceEnabled();
}

function redactionMode(): LogRedaction {
  return config.target === 'prod' ? 'anonymous' : 'secrets';
}

function capUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value);
  if (bytes.length <= maxBytes) return { text: value, truncated: false };
  return {
    text: bytes
      .subarray(0, maxBytes)
      .toString('utf8')
      .replace(/\uFFFD+$/u, ''),
    truncated: true,
  };
}

function collectEmails(draft: EmailLogDraft): string[] {
  const found = new Set<string>();
  const fields = [draft.to, draft.from, draft.replyTo, draft.subject, draft.text, draft.error, ...draft.attachmentNames];
  for (const value of fields) {
    if (!value) continue;
    for (const match of value.matchAll(emailPattern())) {
      found.add(match[0].toLowerCase());
      if (found.size >= MAX_LOOKUP_EMAILS) return [...found];
    }
  }
  return [...found];
}

function swapEmails(value: string, userIds: ReadonlyMap<string, string>): string {
  return value.replace(emailPattern(), (match) => userIds.get(match.toLowerCase()) ?? match);
}

function withUserIds(draft: EmailLogDraft, userIds: ReadonlyMap<string, string>): EmailLogDraft {
  if (userIds.size === 0) return draft;
  return {
    ...draft,
    to: swapEmails(draft.to, userIds),
    from: draft.from === null ? null : swapEmails(draft.from, userIds),
    replyTo: draft.replyTo === null ? null : swapEmails(draft.replyTo, userIds),
    subject: swapEmails(draft.subject, userIds),
    text: swapEmails(draft.text, userIds),
    error: draft.error === null ? null : swapEmails(draft.error, userIds),
    attachmentNames: draft.attachmentNames.map((name) => swapEmails(name, userIds)),
  };
}

/** The object that will be stored, already redacted for this target.
 * `userIds` is consulted only in anonymous mode, before the remaining
 * addresses are replaced with `[REDACTED]`. */
export function buildEmailLogRecord(
  draft: EmailLogDraft,
  mode: LogRedaction = redactionMode(),
  userIds?: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const named = mode === 'anonymous' && userIds ? withUserIds(draft, userIds) : draft;
  const source = capUtf8(named.text, config.apiLog.bodyMaxBytes);
  const error = named.error === null ? null : capUtf8(named.error, 2_000).text;
  const record = {
    at: new Date().toISOString(),
    target: config.target,
    outcome: named.outcome,
    channel: named.channel,
    kind: named.kind,
    to: named.to,
    from: named.from,
    replyTo: named.replyTo,
    subject: named.subject,
    text: source.text,
    textTruncated: source.truncated,
    html: named.html,
    attachmentCount: named.attachmentNames.length,
    attachmentNames: named.attachmentNames.slice(0, 20).map((name) => capUtf8(name, 200).text),
    error,
  };
  const redacted = redactForLog(record, undefined, mode) as Record<string, unknown>;
  const text = typeof redacted.text === 'string' ? redacted.text : '';
  const bounded = capUtf8(text, Math.min(TEXT_MAX_BYTES, config.apiLog.bodyMaxBytes));
  redacted.text = bounded.text;
  redacted.textTruncated = source.truncated || bounded.truncated;
  return redacted;
}

async function userIdsFor(draft: EmailLogDraft): Promise<ReadonlyMap<string, string>> {
  if (redactionMode() !== 'anonymous' || !userLookup) return new Map();
  try {
    return await userLookup(collectEmails(draft));
  } catch (error) {
    console.error('[email-log] user id lookup failed', error);
    return new Map();
  }
}

export function appendEmailLog(draft: EmailLogDraft): void {
  if (!emailLogEnabled()) return;
  writeQueue = writeQueue
    .then(async () => {
      const line = `${JSON.stringify(buildEmailLogRecord(draft, redactionMode(), await userIdsFor(draft)))}\n`;
      await appendLine(line);
    })
    .catch((error) => {
      console.error('[email-log] write failed', error);
    });
}

async function unlinkGenerations(): Promise<number> {
  let clearedFiles = 0;
  for (let index = 0; index <= config.apiLog.rotateMaxFiles; index += 1) {
    const path = index === 0 ? config.emailLog.filePath : `${config.emailLog.filePath}.${index}`;
    try {
      await unlink(path);
      clearedFiles += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return clearedFiles;
}

/** Deletes the current file and every rotation. Works while the preference
 * is off, so an administrator can still erase a leftover journal. */
export async function clearEmailLogFiles(): Promise<number> {
  let clearedFiles = 0;
  const operation = writeQueue.then(async () => {
    clearedFiles = await unlinkGenerations();
  });
  writeQueue = operation.catch((error) => {
    console.error('[email-log] clear failed', error);
  });
  await operation;
  return clearedFiles;
}

/** Same as `clearEmailLogFiles`, and a no-op while the preference is off. */
export async function clearEmailLogs(): Promise<number> {
  if (!emailLogEnabled()) return 0;
  return clearEmailLogFiles();
}

async function appendLine(line: string): Promise<void> {
  const bytes = Buffer.byteLength(line);
  await mkdir(dirname(config.emailLog.filePath), { recursive: true });
  let currentSize = 0;
  try {
    currentSize = (await stat(config.emailLog.filePath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (currentSize > 0 && currentSize + bytes > config.apiLog.rotateMaxBytes) await rotate();
  const handle = await open(config.emailLog.filePath, 'a', 0o600);
  try {
    await handle.appendFile(line, 'utf8');
  } finally {
    await handle.close();
  }
}

async function rotate(): Promise<void> {
  for (let index = config.apiLog.rotateMaxFiles - 1; index >= 1; index -= 1) {
    const source = `${config.emailLog.filePath}.${index}`;
    const destination = `${config.emailLog.filePath}.${index + 1}`;
    try {
      await rename(source, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  try {
    await rename(config.emailLog.filePath, `${config.emailLog.filePath}.1`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
