import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmailLogMetrics } from '../../../../../src/modules/messaging/application/emailJournal.js';

function line(at: string): string {
  return JSON.stringify({ at, outcome: 'sent', kind: 'user' });
}

describe('createEmailLogMetrics', () => {
  const now = Date.parse('2026-10-06T12:00:00.000Z');
  const hoursBefore = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

  it('counts the last hour, 24 hours, 7 days and 30 days', () => {
    const metrics = createEmailLogMetrics(now);
    metrics.push(line(hoursBefore(0.5)));
    metrics.push(line(hoursBefore(1)));
    metrics.push(line(new Date(now - 60 * 60 * 1000 - 1).toISOString()));
    metrics.push(line(hoursBefore(23)));
    metrics.push(line(hoursBefore(24 * 6)));
    metrics.push(line(hoursBefore(24 * 20)));
    metrics.push(line(hoursBefore(24 * 31)));
    metrics.push('{"outcome":"sent"}');
    const result = metrics.finish();

    assert.equal(result.hour, 2);
    assert.equal(result.day, 4);
    assert.equal(result.week, 5);
    assert.equal(result.month, 6);
  });
});
