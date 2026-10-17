import { describe, expect, it } from 'vitest';
import { cronLogPageChunk, parseCronLogLines } from '../../../../../plugins/tuucho/journal/cron/tuucho-journal-cron/front/adminCronLogEntries';

describe('parseCronLogLines', () => {
  it('puts the newest stored line first and reads counters one level deep', () => {
    const views = parseCronLogLines([
      '{"success":true,"expired":1}',
      '{"success":true,"tracking":{"fetched":2,"failed":0}}',
    ]);
    expect(views).toHaveLength(2);
    expect(views[0]?.chips).toEqual([
      { key: 'fetched', value: 2 },
      { key: 'failed', value: 0 },
    ]);
    expect(views[1]?.ok).toBe(true);
    expect(views[1]?.chips).toEqual([{ key: 'expired', value: 1 }]);
  });

  it('drops a false skipped flag and keeps the run time', () => {
    const views = parseCronLogLines([
      '{"success":true,"at":"2026-10-06T15:17:00.000Z","event":"shipment_tracking","tracking":{"skipped":false,"candidates":4,"fetched":1,"webserviceCalls":[{"request":"secret"}]}}',
    ]);
    expect(views[0]?.at).toBe('2026-10-06T15:17:00.000Z');
    expect(views[0]?.chips.map((chip) => chip.key)).toEqual(['event', 'candidates', 'fetched']);
  });

  it('keeps at, treats error as a failure, and marks junk as unreadable', () => {
    const views = parseCronLogLines([
      '{"success":true,"at":"2026-10-06T08:17:00Z","pings":12}',
      '{"success":false,"error":"ops_server_not_ready"}',
      'not-json',
    ]);
    const junk = views[0];
    const failed = views[1];
    const timed = views[2];
    expect(timed?.at).toBe('2026-10-06T08:17:00Z');
    expect(failed?.ok).toBe(false);
    expect(failed?.error).toBe('ops_server_not_ready');
    expect(junk?.unreadable).toBe(true);
  });
});

describe('cronLogPageChunk', () => {
  const lines = ['{"success":true,"n":1}', '{"success":true,"n":2}', '{"success":true,"n":3}'];

  it('gives the newest page first and says there is more while the tail is full', () => {
    const first = cronLogPageChunk(lines, 1, 2, 500);
    expect(first.rows.map((row) => row.chips[0]?.value)).toEqual([3, 2]);
    expect(first.done).toBe(false);
  });

  it('stops when a page is short or the cap is reached', () => {
    expect(cronLogPageChunk(lines, 2, 2, 500).done).toBe(true);
    expect(cronLogPageChunk(lines, 1, 2, 2).done).toBe(true);
  });
});
