import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionalLanguage, optionalLanguageList } from '../../../src/config/envParsers.js';

test('optionalLanguage falls back when unset and rejects a malformed value by name', () => {
  assert.equal(optionalLanguage(undefined, 'en', 'I18N_DEFAULT_LANG'), 'en');
  assert.equal(optionalLanguage(' FR ', 'en', 'I18N_DEFAULT_LANG'), 'fr');
  assert.equal(optionalLanguage('th', 'en', 'I18N_DEFAULT_LANG'), 'th');
  assert.throws(() => optionalLanguage('xxxx', 'en', 'I18N_DEFAULT_LANG'), /I18N_DEFAULT_LANG: "xxxx"/);
});

test('optionalLanguageList defaults to registered languages and rejects malformed entries', () => {
  assert.deepEqual(optionalLanguageList(undefined, 'I18N_ENABLED_LANGS'), ['en', 'fr']);
  assert.deepEqual(optionalLanguageList('', 'I18N_ENABLED_LANGS'), ['en', 'fr']);
  assert.deepEqual(optionalLanguageList('fr', 'I18N_ENABLED_LANGS'), ['fr']);
  assert.deepEqual(optionalLanguageList('fr, en, fr', 'I18N_ENABLED_LANGS'), ['fr', 'en']);
  assert.deepEqual(optionalLanguageList('en,th', 'I18N_ENABLED_LANGS'), ['en', 'th']);
  assert.throws(() => optionalLanguageList('en,xxxx', 'I18N_ENABLED_LANGS'), /"xxxx" in "en,xxxx"/);
});
