import type { CartItem } from '../api/cart';

export type GiftCartEditLine = Pick<
  CartItem,
  'productId' | 'shapeKey' | 'lengthKey' | 'size' | 'packKey' | 'origin' | 'locked'
>;

function giftUserLineIdentity(item: GiftCartEditLine): string {
  return `${item.origin ?? 'user'}|${item.productId}|${item.shapeKey}|${item.lengthKey}|${item.size}|${item.packKey ?? ''}`;
}

/** Locked gift edition: Julie still choosing, or every remaining user line is locked. */
export function giftCartIsLocked(args: {
  isGiftCart: boolean;
  giftStatus: string | undefined;
  items: GiftCartEditLine[];
}): boolean {
  if (!args.isGiftCart) return false;
  if (args.giftStatus === 'selecting') return true;
  const user = args.items.filter((item) => item.origin !== 'rule');
  return user.length > 0 && user.every((item) => item.locked !== false);
}

/** True when this removal would leave the unlocked payable gift cart with no user lines. */
export function lastGiftUserLineRemoval(args: {
  isGiftCart: boolean;
  giftPayable: boolean;
  giftLocked: boolean;
  userItems: GiftCartEditLine[];
  removing: GiftCartEditLine[];
}): boolean {
  if (!args.isGiftCart || !args.giftPayable || args.giftLocked || args.removing.length === 0) {
    return false;
  }
  const drop = new Set(args.removing.map(giftUserLineIdentity));
  return args.userItems.filter((item) => !drop.has(giftUserLineIdentity(item))).length === 0;
}
