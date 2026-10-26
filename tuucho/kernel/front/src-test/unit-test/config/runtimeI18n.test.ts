import { afterEach, describe, expect, it } from 'vitest';
import {
  narrowEnabledLanguages,
  resolveRuntimeDefaultLang,
  runtimeDefaultLang,
  setRuntimeDefaultLang,
} from '@/config/runtimeI18n';
import type { Lang } from '@/assets/i18n/types';

afterEach(() => {
  setRuntimeDefaultLang(undefined);
});

describe('narrowEnabledLanguages', () => {
  it('intersects the bootstrap set with the build-time set, keeping build order', () => {
    expect(narrowEnabledLanguages(['en', 'fr'], ['fr'])).toEqual(['fr']);
    expect(narrowEnabledLanguages(['en', 'fr'], ['en', 'fr'])).toEqual(['en', 'fr']);
  });

  it('ignores bootstrap languages the build never enabled', () => {
    expect(narrowEnabledLanguages(['en'], ['en', 'th'])).toEqual(['en']);
  });

  it('keeps the build-time set when the intersection would be empty', () => {
    expect(narrowEnabledLanguages(['en', 'fr'], ['th'])).toEqual(['en', 'fr']);
    expect(narrowEnabledLanguages(['en', 'fr'], [])).toEqual(['en', 'fr']);
  });
});

describe('resolveRuntimeDefaultLang', () => {
  it('accepts the configured default when it survives narrowing', () => {
    expect(resolveRuntimeDefaultLang('fr', ['fr'])).toBe('fr');
  });

  it('rejects a default that is not enabled', () => {
    expect(resolveRuntimeDefaultLang('fr', ['en'])).toBeUndefined();
    expect(resolveRuntimeDefaultLang(undefined, ['en'])).toBeUndefined();
  });
});

describe('runtimeDefaultLang', () => {
  it('is en before any bootstrap lands', () => {
    expect(runtimeDefaultLang()).toBe('en');
  });

  it('returns the applied default once set', () => {
    setRuntimeDefaultLang('fr' as Lang);
    expect(runtimeDefaultLang()).toBe('fr');
  });
});
