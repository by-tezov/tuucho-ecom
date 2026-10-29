import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getRegisteredLanguage,
  getRegisteredLanguageCodes,
  isRegisteredLanguage,
  registerLanguage,
  resetLanguages,
} from '@tuucho/plugin-sdk';

test('builtins include en and fr', () => {
  resetLanguages();
  assert.deepEqual(getRegisteredLanguageCodes().sort(), ['en', 'fr']);
  assert.equal(isRegisteredLanguage('en'), true);
  assert.equal(isRegisteredLanguage('th'), false);
});

test('registerLanguage adds a code', () => {
  resetLanguages();
  registerLanguage({
    code: 'th',
    nativeName: 'ไทย',
    ogLocale: 'th_TH',
    dateLocale: 'th-TH',
  });
  assert.equal(isRegisteredLanguage('th'), true);
  assert.ok(getRegisteredLanguageCodes().includes('th'));
});

test('registerLanguage keeps optional flagUrl', () => {
  resetLanguages();
  registerLanguage({
    code: 'th',
    nativeName: 'ไทย',
    ogLocale: 'th_TH',
    flagUrl: 'https://shop.example/brand/flags/th.svg',
  });
  assert.equal(getRegisteredLanguage('th')?.flagUrl, 'https://shop.example/brand/flags/th.svg');
});

test('registerLanguage rejects malformed codes', () => {
  resetLanguages();
  assert.throws(() => registerLanguage({ code: 'e', nativeName: 'E', ogLocale: 'e_E' }));
  assert.throws(() => registerLanguage({ code: 'thai', nativeName: 'Thai', ogLocale: 'th_TH' }));
  assert.throws(() => registerLanguage({ code: 'th', nativeName: '', ogLocale: 'th_TH' }));
});

test('resetLanguages restores builtins only', () => {
  resetLanguages();
  registerLanguage({ code: 'es', nativeName: 'Español', ogLocale: 'es_ES' });
  resetLanguages();
  assert.equal(isRegisteredLanguage('es'), false);
  assert.deepEqual(getRegisteredLanguageCodes().sort(), ['en', 'fr']);
});
