import { describe, expect, it } from 'vitest';
import { isMobileBackPage } from '@/utils/mobileBackNavigation';

describe('isMobileBackPage', () => {
  it('matches the unprefixed detail pages', () => {
    expect(isMobileBackPage('/account')).toBe(true);
    expect(isMobileBackPage('/account/addresses')).toBe(true);
    expect(isMobileBackPage('/pose')).toBe(true);
  });

  it('matches the same pages behind a locale prefix', () => {
    expect(isMobileBackPage('/fr/account')).toBe(true);
    expect(isMobileBackPage('/en/account/payment-methods')).toBe(true);
    expect(isMobileBackPage('/fr/pose')).toBe(true);
  });

  it('still rejects non-back pages, prefixed or not', () => {
    expect(isMobileBackPage('/gallery')).toBe(false);
    expect(isMobileBackPage('/fr/gallery')).toBe(false);
    expect(isMobileBackPage('/cart')).toBe(false);
    expect(isMobileBackPage('/')).toBe(false);
    expect(isMobileBackPage('/fr')).toBe(false);
  });

  it('does not confuse a look-alike segment with a locale prefix', () => {
    expect(isMobileBackPage('/accounting')).toBe(false);
    expect(isMobileBackPage('/fr/accounting')).toBe(false);
  });
});
