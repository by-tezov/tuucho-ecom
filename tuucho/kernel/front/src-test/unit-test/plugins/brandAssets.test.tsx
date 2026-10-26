import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  BRAND_ASSET_KEYS,
  BrandAssetsProvider,
  resolveBrandAsset,
  useBrandAsset,
} from '@/plugins/BrandAssetsContext';

describe('resolveBrandAsset', () => {
  it('returns the override when one is set', () => {
    expect(resolveBrandAsset({ hero: 'https://cdn.example/hero.webp' }, 'hero', '/default.webp')).toBe(
      'https://cdn.example/hero.webp',
    );
  });

  it('falls back to the kernel default when the key is absent', () => {
    expect(resolveBrandAsset({}, 'hero', '/default.webp')).toBe('/default.webp');
  });

  it('ignores a blank override', () => {
    expect(resolveBrandAsset({ hero: '   ' }, 'hero', '/default.webp')).toBe('/default.webp');
  });
});

describe('BRAND_ASSET_KEYS', () => {
  it('covers the hero, about, guide, pose, and onboarding artwork', () => {
    for (const key of [
      'hero',
      'aboutPortrait',
      'aboutDesk',
      'guideSizeChart',
      'poseKit',
      'poseVideoPoster',
      'onboardingHandmade',
      'onboardingDeals',
    ]) {
      expect(BRAND_ASSET_KEYS).toContain(key);
    }
  });
});

describe('useBrandAsset', () => {
  it('is undefined with no overrides (kernel default stays)', () => {
    const { result } = renderHook(() => useBrandAsset('hero'));
    expect(result.current).toBeUndefined();
  });

  it('returns the override published by a provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BrandAssetsProvider assets={{ hero: 'https://cdn.example/hero.webp' }}>{children}</BrandAssetsProvider>
    );
    const { result } = renderHook(() => useBrandAsset('hero'), { wrapper });
    expect(result.current).toBe('https://cdn.example/hero.webp');
  });
});
