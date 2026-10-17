import { useOptionalGiftReceiver } from '../hooks/useGiftReceiver';
import { GiftReceiverCartPage } from './GiftReceiverCartPage';
import { ShopCartPage } from './cart/ShopCartPage';

export function CartPage() {
  const gift = useOptionalGiftReceiver();
  if (gift.active) return <GiftReceiverCartPage />;
  return <ShopCartPage />;
}
