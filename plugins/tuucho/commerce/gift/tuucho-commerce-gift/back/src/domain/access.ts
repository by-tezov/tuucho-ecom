import { failGift } from './errors.js';
import { isTerminalGiftStatus, receiverCanMutate, type GiftStatus } from './statuses.js';

export function assertNotGone(status: GiftStatus, receiverVisibleUntil: Date | null, now = new Date()): void {
  if (
    isTerminalGiftStatus(status) &&
    receiverVisibleUntil &&
    receiverVisibleUntil.getTime() <= now.getTime()
  ) {
    failGift('gift_gone');
  }
}

export function assertReceiverCanMutate(status: GiftStatus): void {
  if (status === 'awaiting_payment' || status === 'paying' || status === 'ordered') {
    failGift('gift_frozen');
  }
  if (!receiverCanMutate(status)) failGift('gift_inactive');
}
