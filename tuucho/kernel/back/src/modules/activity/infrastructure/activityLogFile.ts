import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../../../config/env.js';
import { clearPrivateLog, forEachPrivateLogLine } from '../../../platform/http/apiLog.js';

/** One queue per file so two journal writes cannot interleave a line. */
const queues = new Map<string, Promise<void>>();

function enqueue(filePath: string, task: () => Promise<void>): Promise<void> {
  const previous = queues.get(filePath) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(task);
  queues.set(
    filePath,
    operation.then(
      () => undefined,
      () => undefined,
    ),
  );
  return operation;
}

async function writeLine(filePath: string, line: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'a', 0o600);
  try {
    await handle.appendFile(line, 'utf8');
  } finally {
    await handle.close();
  }
}

/** Append one NDJSON record. Failures propagate so a caller can still roll
 * back the change it was about to commit. */
export function appendActivityLogLine(filePath: string, line: string): Promise<void> {
  const text = line.endsWith('\n') ? line : `${line}\n`;
  return enqueue(filePath, () => writeLine(filePath, text));
}

export async function readActivityLogLines(filePath: string): Promise<string[]> {
  const lines: string[] = [];
  await forEachPrivateLogLine(filePath, 0, (line) => {
    lines.push(line);
  });
  return lines;
}

/** Delete the journal file. Serialized with appends so a write cannot land
 * in a file that is being removed. */
export function clearActivityLogFile(filePath: string): Promise<number> {
  let cleared = 0;
  return enqueue(filePath, async () => {
    cleared = await clearPrivateLog(filePath);
  }).then(() => cleared);
}

export function activityLogPath(): string {
  return config.activityLogFilePath;
}
