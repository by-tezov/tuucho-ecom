import { describe, expect, it } from 'vitest';
import { formatApiLogDuration, parseApiLogLines } from '@/routes/adminApiLogEntries';

describe('parseApiLogLines', () => {
  it('puts the newest call first and keeps method, path, status and bodies', () => {
    const views = parseApiLogLines([
      JSON.stringify({
        at: '2026-10-06T10:00:00.000Z',
        target: 'dev',
        durationMs: 12.4,
        request: { method: 'GET', path: '/gallery', query: {}, headers: { accept: 'application/json' } },
        response: { status: 200, headers: { 'content-type': 'application/json' } },
      }),
      JSON.stringify({
        at: '2026-10-06T10:01:00.000Z',
        target: 'dev',
        durationMs: 40,
        request: { method: 'POST', path: '/checkout', query: { lang: 'fr' }, headers: {}, body: { qty: 1 } },
        response: { status: 400, headers: {}, body: { error: 'invalid' } },
      }),
    ]);
    expect(views[0]?.method).toBe('POST');
    expect(views[0]?.path).toBe('/checkout');
    expect(views[0]?.status).toBe(400);
    expect(views[0]?.queryText).toContain('lang');
    expect(views[0]?.requestBodyText).toContain('qty');
    expect(views[0]?.responseBodyText).toContain('invalid');
    expect(views[1]?.status).toBe(200);
    expect(views[1]?.queryText).toBeNull();
    expect(views[1]?.requestBodyText).toBeNull();
    expect(views[1]?.requestHeadersText).toContain('accept');
  });

  it('marks a line that is not an object as unreadable', () => {
    const views = parseApiLogLines(['not-json', '[]']);
    expect(views.every((view) => view.unreadable)).toBe(true);
  });
});

describe('formatApiLogDuration', () => {
  it('uses milliseconds under one second and seconds from there', () => {
    expect(formatApiLogDuration(12.4)).toBe('12 ms');
    expect(formatApiLogDuration(1500)).toBe('1.5 s');
  });
});
