import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionalLanguage, optionalLanguageList } from '../../../src/config/envParsers.js';

test('optionalLanguage falls back when unset and rejects an unsupported value by name', () => {
  assert.equal(optionalLanguage(undefined, 'en', 'I18N_DEFAULT_LANG'), 'en');
  assert.equal(optionalLanguage(' FR ', 'en', 'I18N_DEFAULT_LANG'), 'fr');
  assert.throws(() => optionalLanguage('xx', 'en', 'I18N_DEFAULT_LANG'), /I18N_DEFAULT_LANG: "xx"/);
});

test('optionalLanguageList defaults to every supported language and rejects bad entries', () => {
  assert.deepEqual(optionalLanguageList(undefined, 'I18N_ENABLED_LANGS'), ['en', 'fr']);
  assert.deepEqual(optionalLanguageList('', 'I18N_ENABLED_LANGS'), ['en', 'fr']);
  assert.deepEqual(optionalLanguageList('fr', 'I18N_ENABLED_LANGS'), ['fr']);
  assert.deepEqual(optionalLanguageList('fr, en, fr', 'I18N_ENABLED_LANGS'), ['fr', 'en']);
  assert.throws(() => optionalLanguageList('en,xx', 'I18N_ENABLED_LANGS'), /"xx" in "en,xx"/);
});
