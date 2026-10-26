import { describe, expect, it } from 'vitest';
import { findViewCandidate } from '@/plugins/viewSelection';

const mods = [
  { pluginId: 'bundled-splash', views: { 'view.boot.splash': 'bundled' } },
  { pluginId: 'user-splash', views: { 'view.boot.splash': 'user' } },
  { pluginId: 'gift', cartSurface: 'gift-cart' },
  { pluginId: 'empty' },
];

describe('findViewCandidate', () => {
  it('returns the first loaded module declaring the view (single owner, not a shadow chain)', () => {
    expect(findViewCandidate(mods, 'view.boot.splash', 'view.cart')?.pluginId).toBe('bundled-splash');
  });

  it('honours the legacy cartSurface alias for the cart view', () => {
    expect(findViewCandidate(mods, 'view.cart', 'view.cart')?.pluginId).toBe('gift');
  });

  it('prefers an explicit views entry over a later cartSurface alias', () => {
    const withView = [{ pluginId: 'gift', cartSurface: 'gift-cart' }, { pluginId: 'empty' }];
    expect(findViewCandidate(withView, 'view.cart', 'view.cart')?.pluginId).toBe('gift');
  });

  it('returns undefined when no module declares the view', () => {
    expect(findViewCandidate(mods, 'view.product', 'view.cart')).toBeUndefined();
    expect(findViewCandidate([], 'view.boot.splash', 'view.cart')).toBeUndefined();
  });
});
