import { rename, readFile, stat, unlink, writeFile } from 'node:fs/promises';

/** One sweep a day. The retention window itself is `CRON_LOG_RETENTION`. */
const SWEEP_MS = 86_400_000;

function stampPath(filePath: string): string {
  return `${filePath}.retention`;
}

/** A line stays when it has no usable `at`, or when that time is still inside
 * the window. Undated lines have no age, so only a clear removes them. */
export function keepCronLogLine(line: string, cutoffMs: number): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  let at: unknown;
  try {
    at = (JSON.parse(trimmed) as { at?: unknown }).at;
  } catch {
    return true;
  }
  if (typeof at !== 'string' || !at) return true;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return true;
  return time >= cutoffMs;
}

async function stampIsFresh(filePath: string, now: number): Promise<boolean> {
  try {
    const info = await stat(stampPath(filePath));
    return now - info.mtimeMs < SWEEP_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Drop dated lines older than `retentionMs`. Returns how many lines went.
 * A fresh stamp skips the rewrite so a daily timer does not reread the file. */
export async function pruneCronLogFile(filePath: string, retentionMs: number, now = Date.now()): Promise<number> {
  if (await stampIsFresh(filePath, now)) return 0;
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  const cutoffMs = now - retentionMs;
  const kept: string[] = [];
  let dropped = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    if (keepCronLogLine(line, cutoffMs)) kept.push(line);
    else dropped += 1;
  }
  if (dropped > 0) {
    const tmp = `${filePath}.${process.pid}.retention-tmp`;
    await writeFile(tmp, kept.length > 0 ? `${kept.join('\n')}\n` : '', { mode: 0o600 });
    try {
      await rename(tmp, filePath);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
  }
  await writeFile(stampPath(filePath), '', { mode: 0o600 });
  return dropped;
}

let timer: NodeJS.Timeout | undefined;

/** First sweep at process start, then about once a day. The timer does not
 * keep the process alive. */
export function startCronLogRetention(filePaths: readonly string[], retentionMs: number): void {
  const run = () => {
    void Promise.all(filePaths.map((filePath) => pruneCronLogFile(filePath, retentionMs))).catch((error) => {
      console.error('[cron-log] retention failed', error);
    });
  };
  run();
  timer = setInterval(run, SWEEP_MS);
  timer.unref();
}

export function stopCronLogRetention(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
