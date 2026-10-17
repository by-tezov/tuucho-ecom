/**
 * Limits how many gallery thumbnail downloads run at once. Mounting many
 * cards still queues work here instead of opening dozens of `/media` GETs
 * in parallel (see PhotoCarousel + useGatedGalleryImage).
 *
 * `maxConcurrent <= 0` disables the gate (immediate src, legacy behaviour) —
 * note this also skips the per-lease timeout below, since there's no lease.
 *
 * Once a slot is granted, a `timeoutMs` clock guarantees it is freed even if
 * the caller's `<img>` never fires `load`/`error` (a hung request otherwise
 * leaks the slot forever and eventually deadlocks the whole queue). The
 * timeout is scheduling-only: it does not classify the browser request as a
 * failed gallery or trigger global UI. A caller may use the notification to
 * replace that one slow request with its own recovery source.
 */

type Waiter = {
  cancelled: boolean;
  started: boolean;
  start: () => void;
  release: () => void;
};

let maxConcurrent = 4;
let timeoutMs = 0;
let active = 0;
const waiters: Waiter[] = [];

export function configureGalleryImageGate(max: number, timeout: number): void {
  maxConcurrent = max;
  timeoutMs = timeout;
  pump();
}

function pump(): void {
  if (maxConcurrent <= 0) {
    while (waiters.length > 0) {
      const next = waiters.shift()!;
      if (!next.cancelled) next.start();
    }
    return;
  }
  while (active < maxConcurrent && waiters.length > 0) {
    const next = waiters.shift()!;
    if (!next.cancelled) next.start();
  }
}

export type GalleryImageLease = {
  src: string;
  release: () => void;
};

export type AcquireGalleryImageOptions = {
  signal?: AbortSignal;
  /** Called once when the scheduling lease expires. This is a local recovery
   * signal, not proof that the media or backend is unavailable. */
  onTimeout?: () => void;
};

/** Acquire a download slot; `release` when the img loads, errors, or unmounts. */
export function acquireGalleryImage(
  url: string,
  options?: AcquireGalleryImageOptions,
): Promise<GalleryImageLease> {
  const signal = options?.signal;
  const onTimeout = options?.onTimeout;

  if (maxConcurrent <= 0) {
    return Promise.resolve({ src: url, release: () => undefined });
  }
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    let released = false;
    let timeoutHandle: number | null = null;
    const release = () => {
      if (released) return;
      released = true;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (waiter.started) {
        active = Math.max(0, active - 1);
        pump();
      }
    };

    const waiter: Waiter = {
      cancelled: false,
      started: false,
      release,
      start: () => {
        if (waiter.cancelled || signal?.aborted) return;
        waiter.started = true;
        active += 1;
        if (timeoutMs > 0) {
          timeoutHandle = window.setTimeout(() => {
            timeoutHandle = null;
            onTimeout?.();
            release();
          }, timeoutMs);
        }
        resolve({ src: url, release });
      },
    };

    const onAbort = () => {
      waiter.cancelled = true;
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      // If the slot was already taken, free it — otherwise scrolling away
      // before `then` runs leaks `active` and freezes later remounts.
      if (waiter.started) {
        release();
      } else {
        reject(new DOMException('Aborted', 'AbortError'));
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    if (active < maxConcurrent) waiter.start();
    else waiters.push(waiter);
  });
}
