/** Shared --json convention for this repo's CLI scripts (library, courier,
 * voucher, order, user, faker, operation, healthz): when json is true, narration
 * that would otherwise go to stdout is redirected to stderr instead, so
 * stdout carries only the single JSON summary printJson prints at the very
 * end of a run — safe to pipe into `jq`, a file, or another script. */
export function log(json: boolean, ...args: unknown[]): void {
  if (json) console.error(...args);
  else console.log(...args);
}

/** Prints a command's final structured result for --json mode. Call once,
 * at the very end of a command's run, after every log() call above. */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** Shared per-item-list convention for this repo's CLI scripts: collect one
 * row object per item while a command runs (instead of a log() line per
 * item), then print them as a single console.table at the end — same
 * "narration vs. structured result" split as log()/printJson, just for a
 * list instead of one line/one JSON blob. No-op in --json mode (the rows
 * are already part of that command's printJson payload) and when there are
 * no rows — an empty console.table still draws an empty box, which reads as
 * a rendering glitch rather than "nothing to show here". */
export function logTable(json: boolean, rows: readonly Record<string, unknown>[]): void {
  if (!json && rows.length > 0) console.table(rows);
}
