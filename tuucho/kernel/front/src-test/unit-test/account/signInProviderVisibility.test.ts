import { describe, expect, it } from 'vitest';
import {
  signInOpeningOn,
  signInProviderOffered,
  signInProviderVisible,
} from '@/components/account/settings/signInProviderVisibility';

describe('signInProviderVisibility', () => {
  const openings = [{ id: 'google' }, { id: 'apple' }, { id: 'facebook' }];

  it('treats sign-in openings as plugin-on, never titles', () => {
    expect(signInOpeningOn(openings, 'google')).toBe(true);
    expect(signInOpeningOn([], 'google')).toBe(false);
    expect(signInOpeningOn(undefined, 'google')).toBe(false);
  });

  it('keeps the row when the plugin is on even if OAuth is empty', () => {
    expect(signInProviderVisible(true, false)).toBe(true);
    expect(signInProviderOffered(true, true, false)).toBe(false);
  });

  it('still shows a linked method after the plugin is turned off', () => {
    expect(signInProviderVisible(false, true)).toBe(true);
  });

  it('hides a provider that is off and not linked', () => {
    expect(signInProviderVisible(false, false)).toBe(false);
  });

  it('offers link only with plugin, shop flag, and credentials', () => {
    expect(signInProviderOffered(true, true, true)).toBe(true);
    expect(signInProviderOffered(true, false, true)).toBe(false);
    expect(signInProviderOffered(false, true, true)).toBe(false);
  });
});
