import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepCronLogLine, pruneCronLogFile } from '../../../../src/platform/http/cronLogRetention.js';

const DAY = 86_400_000;

test('keeps a fresh line, an undated line, and drops an old dated line', () => {
  const cutoff = Date.parse('2026-10-06T00:00:00.000Z');
  assert.equal(keepCronLogLine('{"success":true,"at":"2026-10-06T01:00:00.000Z"}', cutoff), true);
  assert.equal(keepCronLogLine('{"success":false,"error":"ops_request_failed"}', cutoff), true);
  assert.equal(keepCronLogLine('not-json', cutoff), true);
  assert.equal(keepCronLogLine('{"success":true,"at":"2025-10-05T00:00:00.000Z"}', cutoff), false);
  assert.equal(keepCronLogLine('   ', cutoff), false);
});

test('rewrites the journal once, then waits a day before scanning again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cron-log-'));
  const file = join(dir, 'journal.jsonl');
  const now = Date.parse('2026-10-06T12:00:00.000Z');
  const fresh = '{"success":true,"at":"2026-10-06T08:00:00.000Z","event":"shipment_tracking"}\n';
  const old = '{"success":true,"at":"2025-01-01T00:00:00.000Z"}\n';
  const undated = '{"success":false,"error":"ops_request_failed"}\n';
  try {
    await writeFile(file, `${old}${fresh}${undated}`);
    const dropped = await pruneCronLogFile(file, 365 * DAY, now);
    assert.equal(dropped, 1);
    assert.equal(await readFile(file, 'utf8'), `${fresh}${undated}`);
    await writeFile(file, `${old}${fresh}`, { flag: 'w' });
    assert.equal(await pruneCronLogFile(file, 365 * DAY, now), 0);
    assert.equal(await readFile(file, 'utf8'), `${old}${fresh}`);
    const aged = new Date(now - 2 * DAY);
    await utimes(`${file}.retention`, aged, aged);
    assert.equal(await pruneCronLogFile(file, 365 * DAY, now), 1);
    assert.equal(await readFile(file, 'utf8'), fresh);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
