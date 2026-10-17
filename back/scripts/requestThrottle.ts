/** Shared HTTP proxy for the catalogue/courier operation CLIs. Requests are
 * serialized and separated by a minimum idle delay measured from the end of
 * one request to the start of the next. */
export type RequestThrottleMode = 'dev' | 'preprod' | 'prod';

/** Local commands should stay fast; deployed targets get a small protective
 * gap by default. An explicit --throttle value always overrides this. */
export function defaultRequestThrottleMs(mode: RequestThrottleMode): number {
  return mode === 'dev' ? 0 : 149;
}

let throttleMs = 0;
let lastRequestCompletedAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function configureRequestThrottle(value: number): void {
  throttleMs = value;
  lastRequestCompletedAt = 0;
  requestQueue = Promise.resolve();
}

function runWithRequestThrottle<T>(requestFn: () => Promise<T>): Promise<T> {
  const request = requestQueue.then(async () => {
    const remaining = lastRequestCompletedAt + throttleMs - Date.now();
    if (remaining > 0) await delay(remaining);
    try {
      return await requestFn();
    } finally {
      lastRequestCompletedAt = Date.now();
    }
  });

  requestQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

export function requestWithThrottle(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return runWithRequestThrottle(() => fetch(input, init));
}
