import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  apiLogContentMatches,
  createApiLogCollector,
  createApiLogMetrics,
  type ApiLogFilter,
} from '../../../../src/modules/admin/application/apiLogFilter.js';

/** `lines` are oldest first, the same order the files store. */
function collectApiLogQuery(lines: readonly string[], filter: ApiLogFilter, limit: number) {
  const collector = createApiLogCollector(filter, limit);
  for (const line of lines) collector.push(line);
  return collector.finish();
}

function line(path: string, at: string, extra = ''): string {
  return JSON.stringify({
    at,
    request: { method: 'GET', path, body: extra ? { note: extra } : undefined },
    response: { status: 200 },
  });
}

describe('apiLogContentMatches', () => {
  it('matches a substring when there is no star, and treats other punctuation as literal', () => {
    assert.equal(apiLogContentMatches('GET /checkout?x=1', 'checkout'), true);
    assert.equal(apiLogContentMatches('a.b', 'a.b'), true);
    assert.equal(apiLogContentMatches('ab', 'a.b'), false);
    assert.equal(apiLogContentMatches('Hello', 'hello'), true);
  });

  it('uses * as any text, including none', () => {
    assert.equal(apiLogContentMatches('{"path":"/checkout"}', '*checkout*'), true);
    assert.equal(apiLogContentMatches('foobar', 'foo*bar'), true);
    assert.equal(apiLogContentMatches('foo*bar', 'foo*bar'), true);
    assert.equal(apiLogContentMatches('prefix-end', 'prefix*'), true);
    assert.equal(apiLogContentMatches('start-suffix', '*suffix'), true);
    assert.equal(apiLogContentMatches('axxbxxc', 'a*b*c'), true);
    assert.equal(apiLogContentMatches('ac', 'a*b*c'), false);
    assert.equal(apiLogContentMatches('anything', '*'), true);
  });
});

describe('collectApiLogQuery', () => {
  const lines = [
    line('/gallery', '2026-10-01T10:00:00.000Z', 'alpha'),
    line('/checkout', '2026-10-02T10:00:00.000Z', 'beta'),
    line('/checkout', '2026-10-03T12:00:00.000Z', 'gamma'),
  ];

  it('filters by exact route, inclusive dates, and content, and keeps the newest matches', () => {
    const result = collectApiLogQuery(
      lines,
      {
        route: '/checkout',
        fromMs: Date.parse('2026-10-02T00:00:00.000Z'),
        toMs: Date.parse('2026-10-02T23:59:59.999Z'),
        content: '*beta*',
      },
      10,
    );
    assert.equal(result.lines.length, 1);
    assert.match(result.lines[0] ?? '', /beta/);
    assert.deepEqual(result.routes, ['/checkout', '/gallery']);
    assert.equal(result.truncated, false);
  });

  it('drops a line with no date when a range is set, and reports a truncated newest window', () => {
    const undated = '{"request":{"path":"/healthz"}}';
    const ranged = collectApiLogQuery(
      [undated, ...lines],
      { route: '', fromMs: Date.parse('2026-10-01T00:00:00.000Z'), toMs: null, content: '' },
      10,
    );
    assert.equal(ranged.lines.length, 3);
    const window = collectApiLogQuery(lines, { route: '', fromMs: null, toMs: null, content: '' }, 2);
    assert.equal(window.truncated, true);
    assert.match(window.lines[0] ?? '', /2026-10-02/);
    assert.match(window.lines[1] ?? '', /2026-10-03/);
  });
});

describe('createApiLogMetrics', () => {
  const now = Date.parse('2026-10-06T12:00:00.000Z');
  const hoursBefore = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

  it('counts rolling hour, 24 hour, 7 day and 30 day windows and ranks the top 10', () => {
    const metrics = createApiLogMetrics(now);
    metrics.push(line('/checkout', hoursBefore(1)));
    metrics.push(line('/checkout', hoursBefore(1)));
    metrics.push(line('/gallery', hoursBefore(23)));
    metrics.push(line('/gallery', new Date(now - 24 * 60 * 60 * 1000 - 1).toISOString()));
    metrics.push(line('/orders', hoursBefore(24 * 6)));
    metrics.push(line('/healthz', hoursBefore(0.5)));
    metrics.push(line('/healthz', hoursBefore(24 * 20)));
    metrics.push(line('/old', hoursBefore(24 * 31)));
    metrics.push('{"request":{"path":"/undated"}}');
    const result = metrics.finish();

    assert.equal(result.hour.requests, 2);
    assert.deepEqual(result.hour.top, [
      { path: '/checkout', count: 2 },
      { path: '/healthz', count: 1 },
    ]);
    assert.equal(result.day.requests, 3);
    assert.deepEqual(result.day.top, [
      { path: '/checkout', count: 2 },
      { path: '/gallery', count: 1 },
      { path: '/healthz', count: 1 },
    ]);
    assert.equal(result.week.requests, 5);
    assert.deepEqual(
      result.week.top.map((entry) => entry.path),
      ['/checkout', '/gallery', '/healthz', '/orders'],
    );
    assert.equal(result.month.requests, 5);
    assert.deepEqual(
      result.month.top.find((entry) => entry.path === '/healthz'),
      { path: '/healthz', count: 2 },
    );
    assert.equal(result.month.top.some((entry) => entry.path === '/old'), false);
  });

  it('keeps only the 10 busiest paths', () => {
    const metrics = createApiLogMetrics(now);
    for (let index = 0; index < 11; index += 1) {
      const path = `/r${String(index).padStart(2, '0')}`;
      for (let hit = 0; hit < 11 - index; hit += 1) metrics.push(line(path, hoursBefore(1)));
    }
    const result = metrics.finish();
    assert.equal(result.hour.requests, 66);
    assert.equal(result.day.requests, 66);
    assert.equal(result.hour.top.length, 10);
    assert.equal(result.day.top.length, 10);
    assert.equal(result.day.top[0]?.path, '/r00');
    assert.equal(result.day.top[0]?.count, 11);
    assert.equal(result.day.top.some((entry) => entry.path === '/r10'), false);
  });
});
