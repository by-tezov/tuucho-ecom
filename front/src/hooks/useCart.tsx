import { useContext } from 'react';
import {
  CartCommandsContext,
  CartDataContext,
  CartOverlayContext,
  type CartCommandsContextValue,
  type CartDataContextValue,
  type CartOverlayContextValue,
} from './cartContext';

export type { JustAddedItem } from './cartContext';

export function useCartData(): CartDataContextValue {
  const context = useContext(CartDataContext);
  if (!context) throw new Error('useCartData must be used within CartProvider');
  return context;
}

export function useCartCommands(): CartCommandsContextValue {
  const context = useContext(CartCommandsContext);
  if (!context) throw new Error('useCartCommands must be used within CartProvider');
  return context;
}

export function useCartOverlay(): CartOverlayContextValue {
  const context = useContext(CartOverlayContext);
  if (!context) throw new Error('useCartOverlay must be used within CartProvider');
  return context;
}
