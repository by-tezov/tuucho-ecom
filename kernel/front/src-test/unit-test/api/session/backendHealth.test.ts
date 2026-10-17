import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

async function loadModule() {
  vi.resetModules();
  return import('@/api/session/backendHealth');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

describe('backend health', () => {
  it('needs three consecutive failed probes before publishing down', async () => {
    const health = await loadModule();
    const listener = vi.fn();
    health.subscribeBackendStatus(listener);
    fetchMock.mockRejectedValue(new TypeError('offline'));

    const result = health.checkBackendHealth();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toBe('down');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(health.getBackendStatus()).toBe('down');
    expect(listener).toHaveBeenCalledWith('down');
  });

  it('publishes up as soon as one retry succeeds', async () => {
    const health = await loadModule();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    const result = health.checkBackendHealth();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toBe('up');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent callers onto one probe', async () => {
    const health = await loadModule();
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    const [first, second] = [health.checkBackendHealth(), health.checkBackendHealth()];
    expect(first).toBe(second);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('polls for recovery only while down', async () => {
    const health = await loadModule();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const down = health.checkBackendHealth();
    await vi.advanceTimersByTimeAsync(5_000);
    await down;

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(health.getBackendStatus()).toBe('up');
    const callsAfterRecovery = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock.mock.calls.length).toBe(callsAfterRecovery);
  });

  it('flags only 5xx and status 0 as suspicious', async () => {
    const { isSuspiciousBackendHttpStatus } = await loadModule();
    expect(isSuspiciousBackendHttpStatus(0)).toBe(true);
    expect(isSuspiciousBackendHttpStatus(500)).toBe(true);
    expect(isSuspiciousBackendHttpStatus(503)).toBe(true);
    expect(isSuspiciousBackendHttpStatus(401)).toBe(false);
    expect(isSuspiciousBackendHttpStatus(429)).toBe(false);
  });
});
