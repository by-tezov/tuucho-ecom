import { describe, expect, it } from 'vitest';
import {
  localeEnablement,
  localeEnablementFromKey,
  localeEnablementKey,
  localePackLang,
} from '@/plugins/localeCatalog';

const plugins = [
  { id: 'tuucho-page-home', enabled: true },
  { id: 'tuucho-locale-fr', enabled: true },
  { id: 'shop-notes', enabled: false },
];

describe('localeEnablementKey', () => {
  it('is value-stable across new arrays and id order', () => {
    const shuffled = [
      { id: 'shop-notes', enabled: false },
      { id: 'tuucho-locale-fr', enabled: true },
      { id: 'tuucho-page-home', enabled: true },
    ];
    expect(localeEnablementKey(plugins)).toBe(localeEnablementKey(shuffled));
    expect(localeEnablementKey(plugins)).toBe(localeEnablementKey([...plugins]));
  });

  it('treats an empty catalog as all plugins on', () => {
    expect(localeEnablementKey([])).toBe('all');
    expect(localeEnablementFromKey('all')).toBe('all');
  });
});

describe('localePackLang', () => {
  it('matches tuucho-locale-fr and complement packs for the active language', () => {
    expect(localePackLang('tuucho-locale-fr')).toBe('fr');
    expect(localePackLang('tuucho-commerce-gift-locale-fr')).toBe('fr');
    expect(localePackLang('shop-notes-locale-en')).toBe('en');
    expect(localePackLang('tuucho-page-home')).toBeNull();
  });
});

describe('localeEnablement', () => {
  it('returns a new Set each call, which must not be an effect dependency', () => {
    expect(localeEnablement(plugins)).not.toBe(localeEnablement(plugins));
    expect([...localeEnablement(plugins)].sort()).toEqual(['tuucho-locale-fr', 'tuucho-page-home']);
  });
});
