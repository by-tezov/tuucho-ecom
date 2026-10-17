export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Run `work` while ensuring at least `ms` elapses before settling — success
 * and failure both wait so a fast error does not flash the overlay away.
 * Pass one of `shopConfig.loadingMinMs.short` / `.normal` / `.long`; those
 * three are the only floors, so overlays stay consistent across screens.
 */
export async function withMinDuration<T>(work: Promise<T>, ms: number): Promise<T> {
  const [settled] = await Promise.all([
    work.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    delay(ms),
  ]);
  if (settled.ok) return settled.value;
  throw settled.error;
}

/**
 * Reject an external operation which has not settled within `ms`. This cannot
 * cancel an SDK request already in flight, but it gives control back to the
 * customer instead of leaving a payment overlay forever.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof window.setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}
