import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  shopConfig: {
    enabledLanguages: ['en', 'fr'],
  },
}));

import {
  DEFAULT_LANG,
  localizeIfBare,
  localizedPath,
  localizedSiblings,
  stripLangPrefix,
} from '@/config/i18nRoutes';

describe('i18nRoutes locale prefixes', () => {
  it('prefixes every enabled language, including French', () => {
    expect(localizedPath('/gallery', 'fr')).toBe('/fr/gallery');
    expect(localizedPath('/gallery', 'en')).toBe('/en/gallery');
    expect(localizedPath('/', 'fr')).toBe('/fr');
    expect(localizedPath('/', 'en')).toBe('/en');
    expect(localizedPath('/account/addresses', 'fr')).toBe('/fr/account/addresses');
  });

  it('treats /fr as a language prefix, not as a bare French page', () => {
    expect(stripLangPrefix('/fr/gallery')).toEqual({ lang: 'fr', rest: '/gallery' });
    expect(stripLangPrefix('/en/gallery')).toEqual({ lang: 'en', rest: '/gallery' });
    expect(stripLangPrefix('/fr')).toEqual({ lang: 'fr', rest: '/' });
    expect(stripLangPrefix('/gallery')).toEqual({ lang: null, rest: '/gallery' });
    expect(stripLangPrefix('/admin')).toEqual({ lang: null, rest: '/admin' });
  });

  it('localizes a bare path and leaves an already-prefixed or admin path alone', () => {
    expect(localizeIfBare('/gallery?product=AQ-YZ-001', 'fr')).toBe('/fr/gallery?product=AQ-YZ-001');
    expect(localizeIfBare('/en/gallery?product=AQ-YZ-001', 'fr')).toBe('/en/gallery?product=AQ-YZ-001');
    expect(localizeIfBare('/home', 'en')).toBe('/en/home');
    expect(localizeIfBare('/auth/facebook-return', 'fr')).toBe('/auth/facebook-return');
  });

  it('emits English first, then French', () => {
    const siblings = localizedSiblings('/gallery');
    expect(siblings[0]).toEqual({ lang: DEFAULT_LANG, href: '/en/gallery' });
    expect(siblings.find((s) => s.lang === 'fr')).toEqual({ lang: 'fr', href: '/fr/gallery' });
    expect(localizedSiblings('/fr/about').find((s) => s.lang === 'fr')?.href).toBe('/fr/about');
  });

  it('localizes gift create, giver, and receiver paths', () => {
    expect(localizedPath('/gift', 'fr')).toBe('/fr/gift');
    expect(localizedPath('/gift/giver/abc/cart', 'en')).toBe('/en/gift/giver/abc/cart');
    expect(localizedPath('/gift/abc', 'fr')).toBe('/fr/gift/abc');
    expect(stripLangPrefix('/fr/gift/giver/abc').rest).toBe('/gift/giver/abc');
    expect(localizedSiblings('/gift').find((s) => s.lang === 'fr')?.href).toBe('/fr/gift');
  });
});
