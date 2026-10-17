import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, isApiRequestTimeoutError, isBackendUnavailableError } from '../../../src/api/http';

const health = vi.hoisted(() => ({
  checkBackendHealth: vi.fn(),
  getBackendStatus: vi.fn(),
}));
vi.mock('../../../src/api/session/backendHealth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/session/backendHealth')>()),
  checkBackendHealth: health.checkBackendHealth,
  getBackendStatus: health.getBackendStatus,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  health.getBackendStatus.mockReturnValue('up');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
  health.checkBackendHealth.mockReset();
  health.getBackendStatus.mockReset();
});

describe('apiFetch', () => {
  it('prefixes the API base URL and never probes health on a normal response', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    const response = await apiFetch('/cart');
    expect(response.status).toBe(404);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3000/cart');
    expect(health.checkBackendHealth).not.toHaveBeenCalled();
  });

  it('turns a network failure into BackendUnavailableError when /healthz confirms down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    health.checkBackendHealth.mockResolvedValue('down');
    const error = await apiFetch('/cart').catch((reason: unknown) => reason);
    expect(isBackendUnavailableError(error)).toBe(true);
  });

  it('rethrows the original failure when the backend is still up', async () => {
    const original = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(original);
    health.checkBackendHealth.mockResolvedValue('up');
    await expect(apiFetch('/cart')).rejects.toBe(original);
  });

  it('confirms a suspicious 5xx with /healthz but returns it when the backend is up', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    health.checkBackendHealth.mockResolvedValue('up');
    expect((await apiFetch('/cart')).status).toBe(503);
    expect(health.checkBackendHealth).toHaveBeenCalledTimes(1);

    health.checkBackendHealth.mockResolvedValue('down');
    const error = await apiFetch('/cart').catch((reason: unknown) => reason);
    expect(isBackendUnavailableError(error)).toBe(true);
  });

  it('reports its own 30s timeout distinctly from a caller abort', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    health.checkBackendHealth.mockResolvedValue('up');

    const timedOut = apiFetch('/slow').catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(isApiRequestTimeoutError(await timedOut)).toBe(true);

    const caller = new AbortController();
    const aborted = apiFetch('/slow', { signal: caller.signal }).catch((reason: unknown) => reason);
    caller.abort();
    const abortError = await aborted;
    expect(isApiRequestTimeoutError(abortError)).toBe(false);
    expect((abortError as DOMException).name).toBe('AbortError');
  });
});
