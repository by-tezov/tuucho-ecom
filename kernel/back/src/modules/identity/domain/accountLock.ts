export type AccountLockSource = 'customer' | 'admin' | 'ops';

export const CUSTOMER_SELF_LOCK_REASON =
  "Alerte changement d'e-mail : la cliente a cliqué sur « Ce n'était pas moi ».";

export const OPS_DEFAULT_LOCK_REASON = 'Verrouillage opérateur.';

const LOCK_REASON_MAX = 500;
const LOCK_REASON_MIN = 3;

export function normalizeLockReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < LOCK_REASON_MIN || trimmed.length > LOCK_REASON_MAX) return null;
  return trimmed;
}

export type AccountLockInput = {
  reason: string;
  source: AccountLockSource;
  lockedByUserId?: string | null;
};
