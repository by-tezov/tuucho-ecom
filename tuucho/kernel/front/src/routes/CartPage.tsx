import { useOptionalGiftReceiver } from '../hooks/useGiftReceiver';
import { PluginCartSurface } from '../plugins/PluginHost';
import { ShopCartPage } from './cart/ShopCartPage';

export function CartPage() {
  const gift = useOptionalGiftReceiver();
  if (gift.active) return <PluginCartSurface fallback={<ShopCartPage />} />;
  return <ShopCartPage />;
}
