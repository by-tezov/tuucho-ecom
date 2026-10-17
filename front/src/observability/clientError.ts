/**
 * Privacy-safe client diagnostics. This deliberately records only a stable
 * error kind and non-identifying build/route metadata: never exception text,
 * stack traces, query strings, form values, tokens, or network payloads.
 * Replace this single boundary with a consent-reviewed reporter if external
 * monitoring is introduced later.
 */
type ClientErrorKind = 'render' | 'hydration';

function metadata(kind: ClientErrorKind): Record<string, string> {
  return {
    kind,
    version: __APP_VERSION__,
    target: __APP_TARGET__,
    // Pathname intentionally omits query/hash, which can contain personal or
    // OAuth/payment data. It is useful for grouping route-level failures.
    path: window.location.pathname,
  };
}

export function reportClientError(kind: ClientErrorKind): void {
  // Console is the intentionally minimal local reporting transport. Do not
  // pass Error objects here: their message/stack may include user data.
  console.error('[Lumen client error]', metadata(kind));
}

export function reportHydrationError(): void {
  reportClientError('hydration');
}
