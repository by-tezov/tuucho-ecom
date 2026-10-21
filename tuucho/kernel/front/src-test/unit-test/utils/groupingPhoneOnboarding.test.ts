import { afterEach, describe, expect, it } from 'vitest';
import { groupCartLinesByShape } from '@/utils/groupCartLines';
import { isPhoneCountrySupported, isValidPhoneNumberForCountry, toPhoneCountries } from '@/utils/phone';
import {
  ONBOARDING_STORAGE_COMPLETED,
  ONBOARDING_STORAGE_KEY,
  consumeOnboardingReplay,
  isLocalOnboardingCompleted,
  isOnboardingReplayRequested,
  markLocalOnboardingCompleted,
  requestOnboardingReplay,
} from '@/state/onboardingGate';
import type { CartItem } from '@/api/cart';
import type { GalleryItem } from '@/data/types';

afterEach(() => {
  window.localStorage.clear();
  while (consumeOnboardingReplay()) {
    // drain replay flag between tests
  }
});

describe('groupCartLinesByShape', () => {
  it('groups by set+shape+length and sorts by title', () => {
    const setA = {
      id: 'a',
      title: 'Beta',
      shape: { almond: 'Amande' },
      lengthsByShape: { almond: { medium: 'Moyen' } },
    } as GalleryItem;
    const setB = {
      id: 'b',
      title: 'Alpha',
      shape: { square: 'Carrée' },
      lengthsByShape: { square: { medium: 'Moyen' } },
    } as GalleryItem;
    const line = (productId: string, shapeKey: string, lengthKey: string, size: string): CartItem =>
      ({ productId, shapeKey, lengthKey, size, quantity: 1 }) as CartItem;

    const groups = groupCartLinesByShape([
      { item: line('a', 'almond', 'medium', 'M'), set: setA },
      { item: line('a', 'almond', 'medium', 'S'), set: setA },
      { item: line('b', 'square', 'medium', 'M'), set: setB },
    ]);

    expect(groups.map((group) => group.set.title)).toEqual(['Alpha', 'Beta']);
    expect(groups[1]?.variants).toHaveLength(2);
    expect(groups[0]?.shapeLabel).toBe('Carrée');
  });
});

describe('phone', () => {
  it('filters supported countries and validates national numbers', () => {
    expect(isPhoneCountrySupported('FR')).toBe(true);
    expect(isPhoneCountrySupported('XX')).toBe(false);
    expect(toPhoneCountries(['fr', 'FR', 'XX'])).toEqual(['FR']);
    expect(isValidPhoneNumberForCountry('0612345678', 'FR')).toBe(true);
    expect(isValidPhoneNumberForCountry('+49612345678', 'FR')).toBe(false);
  });
});

describe('onboardingGate', () => {
  it('persists completion and one-shot replay', () => {
    expect(isLocalOnboardingCompleted()).toBe(false);
    markLocalOnboardingCompleted();
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe(ONBOARDING_STORAGE_COMPLETED);
    expect(isLocalOnboardingCompleted()).toBe(true);

    expect(isOnboardingReplayRequested()).toBe(false);
    requestOnboardingReplay();
    expect(isOnboardingReplayRequested()).toBe(true);
    expect(consumeOnboardingReplay()).toBe(true);
    expect(consumeOnboardingReplay()).toBe(false);
  });
});
