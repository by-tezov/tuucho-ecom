import type { GiftStatus as ContractGiftStatus } from '../../../contract/gift.js';
export const GIFT_STATUSES = [
  'selecting',
  'awaiting_payment',
  'paying',
  'ordered',
  'cancelled',
  'expired',
] as const;

/** Published in every gift payload, so the API contract owns the vocabulary.
 * The list above must stay exactly these values; the assignment below is what
 * makes a divergence a compile error. */
export type GiftStatus = ContractGiftStatus;
const _statusesMatchContract: readonly ContractGiftStatus[] = GIFT_STATUSES;
void _statusesMatchContract;

export function isGiftStatus(value: string): value is GiftStatus {
  return (GIFT_STATUSES as readonly string[]).includes(value);
}

export function receiverCanMutate(status: GiftStatus): boolean {
  return status === 'selecting';
}

export function isTerminalGiftStatus(status: GiftStatus): boolean {
  return status === 'ordered' || status === 'cancelled' || status === 'expired';
}

/** Non-terminal promises shown on the admin active-offer list. */
export const LIVE_GIFT_STATUSES: readonly GiftStatus[] = GIFT_STATUSES.filter(
  (status) => !isTerminalGiftStatus(status),
);

export function canOpenPay(status: GiftStatus): boolean {
  return status === 'awaiting_payment' || status === 'paying';
}

/** Giver token may create/attach a session and open the gift cart without
 * freezing Julie. Checkout still uses `canOpenPay`. */
export function canClaimGiverSession(status: GiftStatus): boolean {
  return status === 'selecting' || status === 'awaiting_payment' || status === 'paying';
}

export function canUnlockGiverCart(status: GiftStatus): boolean {
  return status === 'awaiting_payment' || status === 'paying';
}
