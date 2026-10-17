/** Stable client-side representation of the API error envelope.
 *
 * Domain modules depend on this file instead of importing the historical
 * all-in-one API module. That keeps transport failures usable without
 * creating feature-to-feature dependencies.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly violations: string[] | undefined;
  /** Human-readable detail from the API envelope when the server provides one. */
  readonly serverMessage: string | undefined;
  /** Ceiling from `gift_budget_ceiling`. */
  readonly max: number | undefined;
  /** Floor from `gift_budget_floor`. */
  readonly min: number | undefined;
  readonly field: string | undefined;
  /** Seconds until the next gift PIN try (`gift_pin_throttled` / invalid with backoff). */
  readonly retryAfterSec: number | undefined;
  readonly retryAt: string | undefined;
  readonly throttled: boolean | undefined;
  /** Why the password was cancelled, on `password_cancelled`. */
  readonly reason: string | undefined;

  constructor(
    code: string,
    status: number,
    violations?: string[],
    serverMessage?: string,
    extras?: {
      max?: number;
      min?: number;
      field?: string;
      retryAfterSec?: number;
      retryAt?: string;
      throttled?: boolean;
      reason?: string;
    },
  ) {
    super(serverMessage?.trim() || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.violations = violations;
    this.serverMessage = serverMessage?.trim() || undefined;
    this.max = extras?.max;
    this.min = extras?.min;
    this.field = extras?.field;
    this.retryAfterSec = extras?.retryAfterSec;
    this.retryAt = extras?.retryAt;
    this.throttled = extras?.throttled;
    this.reason = extras?.reason;
  }
}
