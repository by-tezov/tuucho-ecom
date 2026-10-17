import { mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../../config/env.js';
import { isApiLogPreferenceEnabled } from '../../modules/settings/application/appPreferences.js';

/**
 * Rotating NDJSON writer for API diagnostics. Writes are serialized: without
 * that queue two concurrent responses could both rotate the same file and
 * lose a line. A failure to write diagnostics must never affect the API.
 */
let writeQueue: Promise<void> = Promise.resolve();

export interface ApiLogRecord {
  at: string;
  target: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  durationMs: number;
}

export function apiLogEnabled(): boolean {
  return isApiLogPreferenceEnabled();
}

export function appendApiLog(record: ApiLogRecord): void {
  if (!apiLogEnabled()) return;
  const line = `${JSON.stringify(record)}\n`;
  writeQueue = writeQueue
    .then(() => appendLine(line))
    .catch((error) => {
      // Keep the queue usable after an I/O failure and keep diagnostics from
      // becoming an availability dependency.
      console.error('[api-log] write failed', error);
    });
}

async function unlinkApiLogGenerations(): Promise<number> {
  let clearedFiles = 0;
  for (let index = 0; index <= config.apiLog.rotateMaxFiles; index += 1) {
    const path = index === 0 ? config.apiLog.filePath : `${config.apiLog.filePath}.${index}`;
    try {
      await unlink(path);
      clearedFiles += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return clearedFiles;
}

/** Delete the current log and every retained generation. Serialized with
 * writes so a request cannot append into a file while it is being cleared.
 * The admin page uses this even when logging is off, so a leftover file can
 * still be erased. */
export async function clearApiLogFiles(): Promise<number> {
  let clearedFiles = 0;
  const operation = writeQueue.then(async () => {
    clearedFiles = await unlinkApiLogGenerations();
  });
  writeQueue = operation.catch((error) => {
    console.error('[api-log] clear failed', error);
  });
  await operation;
  return clearedFiles;
}

/** Same as `clearApiLogFiles`, and a no-op while diagnostic logging is off. */
export async function clearApiLogs(): Promise<number> {
  if (!apiLogEnabled()) return 0;
  return clearApiLogFiles();
}

/** Remove one non-rotating private log file. The shipment cron opens the
 * file afresh for each run, so its next run recreates it normally. */
export async function clearPrivateLog(filePath: string): Promise<number> {
  try {
    await unlink(filePath);
    return 1;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

async function appendLine(line: string): Promise<void> {
  const bytes = Buffer.byteLength(line);
  await mkdir(dirname(config.apiLog.filePath), { recursive: true });
  let currentSize = 0;
  try {
    currentSize = (await stat(config.apiLog.filePath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (currentSize > 0 && currentSize + bytes > config.apiLog.rotateMaxBytes) {
    await rotate();
  }
  const handle = await open(config.apiLog.filePath, 'a', 0o600);
  try {
    await handle.appendFile(line, 'utf8');
  } finally {
    await handle.close();
  }
}

async function rotate(): Promise<void> {
  for (let index = config.apiLog.rotateMaxFiles - 1; index >= 1; index -= 1) {
    const source = `${config.apiLog.filePath}.${index}`;
    const destination = `${config.apiLog.filePath}.${index + 1}`;
    try {
      await rename(source, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  try {
    await rename(config.apiLog.filePath, `${config.apiLog.filePath}.1`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Read a bounded tail without loading an unbounded diagnostics file. */
export async function readApiLogTail(lines: number): Promise<string[]> {
  if (!apiLogEnabled()) return [];
  return readPrivateLogTail(config.apiLog.filePath, lines);
}

/** Read a bounded tail from a private newline-delimited log without loading
 * the whole file. Used by API diagnostics and the production cron log. */
export async function readPrivateLogTail(filePath: string, lines: number): Promise<string[]> {
  const wanted = Math.max(1, Math.min(lines, 500));
  let handle;
  try {
    handle = await open(filePath, 'r');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  try {
    const size = (await handle.stat()).size;
    const bytesToRead = Math.min(size, 1024 * 1024);
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, size - bytesToRead);
    let content = buffer.toString('utf8');
    // A bounded tail can start midway through an NDJSON record. Discard that
    // fragment rather than returning a line that cannot be parsed by a human
    // or a log processor.
    if (bytesToRead < size) {
      const firstNewline = content.indexOf('\n');
      content = firstNewline >= 0 ? content.slice(firstNewline + 1) : '';
    }
    return content.split('\n').filter(Boolean).slice(-wanted);
  } finally {
    await handle.close();
  }
}

/** One generation is already capped by rotation. This stops a mis-set cap
 * from reading an unbounded file into memory. */
const MAX_GENERATION_BYTES = 32 * 1024 * 1024;

/** Visit every stored line, oldest generation first, then the current file.
 * `generations` is the number of rotated copies (`0` is the current file). */
export async function forEachPrivateLogLine(
  filePath: string,
  generations: number,
  visit: (line: string) => void,
): Promise<void> {
  const oldest = Math.max(0, generations);
  for (let index = oldest; index >= 0; index -= 1) {
    const path = index === 0 ? filePath : `${filePath}.${index}`;
    let handle;
    try {
      handle = await open(path, 'r');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    try {
      const size = (await handle.stat()).size;
      const bytesToRead = Math.min(size, MAX_GENERATION_BYTES);
      const buffer = Buffer.alloc(bytesToRead);
      const start = size - bytesToRead;
      await handle.read(buffer, 0, bytesToRead, start);
      let content = buffer.toString('utf8');
      if (start > 0) {
        const firstNewline = content.indexOf('\n');
        content = firstNewline >= 0 ? content.slice(firstNewline + 1) : '';
      }
      for (const line of content.split('\n')) {
        if (line) visit(line);
      }
    } finally {
      await handle.close();
    }
  }
}
