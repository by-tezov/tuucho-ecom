import { failGift } from './errors.js';
import { isTerminalGiftStatus, receiverCanMutate, type GiftStatus } from './statuses.js';

/** Receiver (and giver) links that must not mint a usable PIN / summary.
 * Past `offerExpiresAt` while still selecting, or terminal status with no
 * remaining `receiverVisibleUntil` window → `gift_gone`. */
export function assertNotGone(
  status: GiftStatus,
  receiverVisibleUntil: Date | null,
  now = new Date(),
  offerExpiresAt: Date | null = null,
): void {
  if (
    offerExpiresAt &&
    offerExpiresAt.getTime() <= now.getTime() &&
    !isTerminalGiftStatus(status)
  ) {
    failGift('gift_gone');
  }
  if (!isTerminalGiftStatus(status)) return;
  if (!receiverVisibleUntil || receiverVisibleUntil.getTime() <= now.getTime()) {
    failGift('gift_gone');
  }
}

export function assertReceiverCanMutate(status: GiftStatus): void {
  if (status === 'awaiting_payment' || status === 'paying' || status === 'ordered') {
    failGift('gift_frozen');
  }
  if (!receiverCanMutate(status)) failGift('gift_inactive');
}
