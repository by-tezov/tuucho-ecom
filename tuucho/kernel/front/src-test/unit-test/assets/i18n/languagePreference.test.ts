import { afterEach, describe, expect, it } from 'vitest';
import { preferredLanguage, savePreferredLanguage } from '@/assets/i18n/languagePreference';
import { runtimeDefaultLang, setRuntimeDefaultLang } from '@/config/runtimeI18n';

function browserLanguages(languages: string[]): void {
  Object.defineProperty(window.navigator, 'languages', { configurable: true, value: languages });
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: languages[0] ?? 'en',
  });
}

afterEach(() => {
  setRuntimeDefaultLang(undefined);
});

describe('preferredLanguage fallback order', () => {
  it('lets the stored choice win over the browser locale', () => {
    browserLanguages(['fr-FR']);
    savePreferredLanguage('en');
    expect(preferredLanguage()).toBe('en');
  });

  it('uses the first supported browser locale when nothing is stored', () => {
    browserLanguages(['fr-FR', 'en']);
    expect(preferredLanguage()).toBe('fr');
  });

  it('skips a stored language that is not enabled', () => {
    window.localStorage.setItem('psn-lang', 'th');
    browserLanguages(['fr-FR']);
    expect(preferredLanguage()).toBe('fr');
  });

  it('falls back to the pre-bootstrap default en', () => {
    browserLanguages(['th-TH']);
    expect(preferredLanguage()).toBe('en');
    expect(runtimeDefaultLang()).toBe('en');
  });

  it('falls back to the configured bootstrap default once applied', () => {
    setRuntimeDefaultLang('fr');
    browserLanguages(['th-TH']);
    expect(preferredLanguage()).toBe('fr');
  });
});
