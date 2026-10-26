import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GIFT_RECEIVER_ISOLATED_KEY,
  readImpersonationHandoff,
  writeImpersonationHandoff,
  writeImpersonationHandoffFallback,
  type ImpersonationHandoff,
} from '@/api/session/giftPinSession';

const FALLBACK_KEY = 'tuucho-impersonate-handoff';

const session = {
  user: { id: 'user-1', email: 'client@email.fr' },
  accessToken: 'access-token',
  accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
} as unknown as ImpersonationHandoff;

afterEach(() => {
  vi.useRealTimers();
});

describe('impersonation handoff', () => {
  it('prefers the popup sessionStorage payload and still consumes the fallback', () => {
    writeImpersonationHandoff(sessionStorage, session);
    writeImpersonationHandoffFallback(session);

    expect(readImpersonationHandoff()).toEqual(session);
    expect(sessionStorage.getItem(GIFT_RECEIVER_ISOLATED_KEY)).toBe('1');
    // One-shot: deleted even though sessionStorage answered, so the token
    // never lingers in localStorage.
    expect(localStorage.getItem(FALLBACK_KEY)).toBeNull();
  });

  it('falls back to the localStorage one-shot when the navigation dropped sessionStorage', () => {
    writeImpersonationHandoffFallback(session);

    expect(readImpersonationHandoff()).toEqual(session);
    // One-shot: consumed even by a successful read.
    expect(localStorage.getItem(FALLBACK_KEY)).toBeNull();
    expect(readImpersonationHandoff()).toBeNull();
  });

  it('expires the fallback after its TTL, and still deletes it on read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    writeImpersonationHandoffFallback(session);

    vi.setSystemTime(new Date('2026-01-01T12:00:31Z'));
    expect(readImpersonationHandoff()).toBeNull();
    expect(localStorage.getItem(FALLBACK_KEY)).toBeNull();
  });

  it('accepts the fallback just inside its TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    writeImpersonationHandoffFallback(session);

    vi.setSystemTime(new Date('2026-01-01T12:00:29Z'));
    expect(readImpersonationHandoff()).toEqual(session);
  });

  it('returns null for a malformed fallback payload', () => {
    localStorage.setItem(FALLBACK_KEY, '{not json');
    expect(readImpersonationHandoff()).toBeNull();
  });

  it('returns null when neither carrier holds a handoff', () => {
    expect(readImpersonationHandoff()).toBeNull();
  });
});
