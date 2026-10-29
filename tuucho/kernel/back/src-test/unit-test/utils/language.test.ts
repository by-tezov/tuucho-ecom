import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerLanguage, resetLanguages } from '@tuucho/plugin-sdk';
import {
  assertConfiguredLanguagesRegistered,
  configuredDefaultLanguage,
  configuredEnabledLanguages,
  FALLBACK_LANGUAGE,
  languageFromHeader,
  languageFromPreference,
  pickLanguage,
} from '../../../src/utils/language.js';

function withEnv(key: string, value: string | undefined, run: () => void): void {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

test('the fallback language is en when nothing is configured', () => {
  resetLanguages();
  withEnv('I18N_DEFAULT_LANG', undefined, () => {
    assert.equal(configuredDefaultLanguage(), FALLBACK_LANGUAGE);
    assert.equal(languageFromHeader(undefined), 'en');
    assert.equal(languageFromHeader('de-DE,de;q=0.9'), 'en');
    assert.equal(languageFromPreference('es'), 'en');
  });
});

test('the configured default replaces the en fallback', () => {
  resetLanguages();
  withEnv('I18N_DEFAULT_LANG', 'fr', () => {
    assert.equal(configuredDefaultLanguage(), 'fr');
    assert.equal(languageFromHeader(undefined), 'fr');
    assert.equal(languageFromHeader('de-DE,de;q=0.9'), 'fr');
    assert.equal(languageFromPreference('es'), 'fr');
  });
});

test('a malformed configured default falls back to en rather than crashing', () => {
  resetLanguages();
  withEnv('I18N_DEFAULT_LANG', 'xxxx', () => {
    assert.equal(configuredDefaultLanguage(), 'en');
  });
});

test('header q-value negotiation is unchanged by the configured default', () => {
  resetLanguages();
  withEnv('I18N_DEFAULT_LANG', 'fr', () => {
    assert.equal(languageFromHeader('fr-FR,fr;q=0.9,en;q=0.8'), 'fr');
    assert.equal(languageFromHeader('en;q=0.9,fr;q=0.1'), 'en');
    assert.equal(languageFromHeader('fr;q=0'), 'fr');
  });
});

test('the enabled list defaults to every registered language and keeps format-valid codes', () => {
  resetLanguages();
  withEnv('I18N_ENABLED_LANGS', undefined, () => {
    assert.deepEqual(configuredEnabledLanguages().sort(), ['en', 'fr']);
  });
  withEnv('I18N_ENABLED_LANGS', 'fr', () => {
    assert.deepEqual(configuredEnabledLanguages(), ['fr']);
  });
  withEnv('I18N_ENABLED_LANGS', 'fr, en ,xx,fr', () => {
    assert.deepEqual(configuredEnabledLanguages(), ['fr', 'en', 'xx']);
  });
});

test('assertConfiguredLanguagesRegistered rejects unknown codes after plugins load', () => {
  resetLanguages();
  assert.throws(() => assertConfiguredLanguagesRegistered('en', ['en', 'th']), /unregistered language "th"/);
  registerLanguage({ code: 'th', nativeName: 'ไทย', ogLocale: 'th_TH' });
  assert.doesNotThrow(() => assertConfiguredLanguagesRegistered('en', ['en', 'th']));
  resetLanguages();
});

test('pickLanguage falls back through default then en then fr', () => {
  resetLanguages();
  withEnv('I18N_DEFAULT_LANG', 'fr', () => {
    assert.equal(pickLanguage({ th: 'สวัสดี', fr: 'Bonjour', en: 'Hello' }, 'th'), 'สวัสดี');
    assert.equal(pickLanguage({ fr: 'Bonjour', en: 'Hello' }, 'th'), 'Bonjour');
    assert.equal(pickLanguage({ en: 'Hello' }, 'th'), 'Hello');
    assert.equal(pickLanguage({ de: 'Hallo' }, 'th'), 'Hallo');
  });
});
