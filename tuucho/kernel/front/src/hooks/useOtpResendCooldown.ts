import { useCallback, useEffect, useState } from 'react';

/** Default lock on “Envoyer / Renvoyer le code” after a successful send. */
const OTP_RESEND_COOLDOWN_MS = 120_000;

export interface OtpResendCooldown {
  remainingMs: number;
  isCoolingDown: boolean;
  /** Whole minutes left (for countdown copy). */
  remainingMinutes: number;
  /** Seconds within the current minute (0–59). */
  remainingSeconds: number;
  /** Call after a successful OTP send or resend. */
  start: () => void;
  /** Clear the timer (e.g. dialog closed). */
  reset: () => void;
}

/**
 * Client-side cooldown so shoppers cannot hammer OTP send/resend.
 * Starts at `durationMs` and ticks down every second until zero.
 */
export function useOtpResendCooldown(durationMs: number = OTP_RESEND_COOLDOWN_MS): OtpResendCooldown {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const remainingMs = endsAt == null ? 0 : Math.max(0, endsAt - now);
  const isCoolingDown = remainingMs > 0;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const remainingMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  useEffect(() => {
    if (endsAt == null) return;
    if (endsAt <= Date.now()) {
      setEndsAt(null);
      return;
    }
    setNow(Date.now());
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endsAt) {
        setEndsAt(null);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const start = useCallback(() => {
    setEndsAt(Date.now() + durationMs);
    setNow(Date.now());
  }, [durationMs]);

  const reset = useCallback(() => {
    setEndsAt(null);
  }, []);

  return {
    remainingMs,
    isCoolingDown,
    remainingMinutes,
    remainingSeconds,
    start,
    reset,
  };
}
