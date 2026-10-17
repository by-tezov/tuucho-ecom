import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOtpResendCooldown } from '../../../src/hooks/useOtpResendCooldown';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOtpResendCooldown', () => {
  it('is idle until a send succeeds', () => {
    const { result } = renderHook(() => useOtpResendCooldown());
    expect(result.current.isCoolingDown).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it('defaults to two minutes and counts down in minutes and seconds', () => {
    const { result } = renderHook(() => useOtpResendCooldown());
    act(() => result.current.start());
    expect(result.current).toMatchObject({ isCoolingDown: true, remainingMinutes: 2, remainingSeconds: 0 });

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toMatchObject({ remainingMinutes: 0, remainingSeconds: 59 });

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(result.current.isCoolingDown).toBe(false);
  });

  it('can be reset, for example when the dialog closes', () => {
    const { result } = renderHook(() => useOtpResendCooldown(10_000));
    act(() => result.current.start());
    act(() => result.current.reset());
    expect(result.current.isCoolingDown).toBe(false);
  });
});
