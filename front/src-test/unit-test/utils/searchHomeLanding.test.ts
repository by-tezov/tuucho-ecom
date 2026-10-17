import { describe, expect, it } from 'vitest';
import { galleryPathForSearchEngineHome, isSearchEngineReferrer } from '../../../src/utils/searchHomeLanding';

describe('isSearchEngineReferrer', () => {
  it('recognises major search hosts and the Android Google app', () => {
    expect(isSearchEngineReferrer('https://www.google.fr/search?q=pamsurin')).toBe(true);
    expect(isSearchEngineReferrer('https://www.google.com/')).toBe(true);
    expect(isSearchEngineReferrer('https://www.google.co.uk/')).toBe(true);
    expect(isSearchEngineReferrer('https://www.bing.com/search?q=pamsurin')).toBe(true);
    expect(isSearchEngineReferrer('https://duckduckgo.com/')).toBe(true);
    expect(isSearchEngineReferrer('https://www.qwant.com/')).toBe(true);
    expect(isSearchEngineReferrer('https://www.ecosia.org/search?q=pamsurin')).toBe(true);
    expect(isSearchEngineReferrer('android-app://com.google.android.googlequicksearchbox')).toBe(true);
  });

  it('ignores mail, social, and a direct visit', () => {
    expect(isSearchEngineReferrer('')).toBe(false);
    expect(isSearchEngineReferrer('https://mail.google.com/')).toBe(false);
    expect(isSearchEngineReferrer('https://www.facebook.com/')).toBe(false);
    expect(isSearchEngineReferrer('https://pamsurin.fr/gallery')).toBe(false);
    expect(isSearchEngineReferrer('not a url')).toBe(false);
  });
});

describe('galleryPathForSearchEngineHome', () => {
  const mobileSearch = {
    referrer: 'https://www.google.fr/',
    mobile: true,
    followLocked: false,
  };

  it('sends a phone-sized search landing on Accueil to the gallery', () => {
    expect(galleryPathForSearchEngineHome({ ...mobileSearch, pathname: '/home' })).toBe('/gallery');
    expect(galleryPathForSearchEngineHome({ ...mobileSearch, pathname: '/fr/home' })).toBe('/fr/gallery');
    expect(galleryPathForSearchEngineHome({ ...mobileSearch, pathname: '/en/home' })).toBe('/en/gallery');
  });

  it('keeps Accueil for desktop, bookmarks, other pages, and a gift follow', () => {
    expect(galleryPathForSearchEngineHome({ ...mobileSearch, pathname: '/home', mobile: false })).toBeNull();
    expect(galleryPathForSearchEngineHome({ ...mobileSearch, pathname: '/home', referrer: '' })).toBeNull();
    expect(
      galleryPathForSearchEngineHome({
        ...mobileSearch,
        pathname: '/home',
        referrer: 'https://www.instagram.com/',
      }),
    ).toBeNull();
    expect(galleryPathForSearchEngineHome({ ...mobileSearch, pathname: '/fr/gallery' })).toBeNull();
    expect(
      galleryPathForSearchEngineHome({ ...mobileSearch, pathname: '/fr/home', followLocked: true }),
    ).toBeNull();
  });
});
