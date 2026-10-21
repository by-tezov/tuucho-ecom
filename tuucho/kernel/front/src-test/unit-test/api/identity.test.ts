import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestJson = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({
  requestJson,
  authHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
}));

type IdentityModule = typeof import('@/api/identity');
let identity: IdentityModule;

beforeEach(async () => {
  requestJson.mockReset();
  vi.resetModules();
  identity = await import('@/api/identity');
});

const session = { accessToken: 'at', user: { id: 'u1' } };

describe('refreshSession', () => {
  it('shares one in-flight refresh so a rotated token is never presented twice', async () => {
    let resolve!: (value: unknown) => void;
    requestJson.mockReturnValue(new Promise((r) => (resolve = r)));
    const first = identity.refreshSession();
    const second = identity.refreshSession();
    expect(second).toBe(first);
    resolve(session);
    await expect(first).resolves.toBe(session);
    expect(requestJson).toHaveBeenCalledTimes(1);
    expect(requestJson).toHaveBeenCalledWith('/auth/refresh', { method: 'POST' });

    requestJson.mockResolvedValue(session);
    await identity.refreshSession();
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('records the session hint on success and the anonymous hint on failure', async () => {
    requestJson.mockResolvedValueOnce(session);
    await identity.refreshSession();
    expect(window.localStorage.getItem('psn-auth-hint')).toBe('session');

    requestJson.mockRejectedValueOnce(new Error('401'));
    await expect(identity.refreshSession()).rejects.toThrow('401');
    expect(window.localStorage.getItem('psn-auth-hint')).toBe('anonymous');
  });
});

describe('startAuthBootstrap', () => {
  it('skips the refresh probe for a known anonymous visitor', async () => {
    identity.markAuthSessionAbsent();
    await expect(identity.startAuthBootstrap()).resolves.toBeNull();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('probes once on a first visit and settles to null instead of rejecting', async () => {
    requestJson.mockRejectedValue(new Error('401'));
    const first = identity.startAuthBootstrap();
    expect(identity.startAuthBootstrap()).toBe(first);
    await expect(first).resolves.toBeNull();
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it('restores a remembered session', async () => {
    identity.markAuthSessionPresent();
    requestJson.mockResolvedValue(session);
    await expect(identity.startAuthBootstrap()).resolves.toBe(session);
  });
});

describe('waitForInFlightRefresh', () => {
  it('waits for a pending refresh without surfacing its failure', async () => {
    let reject!: (error: Error) => void;
    requestJson.mockReturnValue(new Promise((_r, j) => (reject = j)));
    void identity.refreshSession().catch(() => undefined);
    const waiting = identity.waitForInFlightRefresh();
    reject(new Error('401'));
    await expect(waiting).resolves.toBeUndefined();
  });
});
