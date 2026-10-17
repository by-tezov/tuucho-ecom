import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NAIL_SEO_COPY } from '../../../../../src/modules/catalog/domain/nailSeoCopy.js';
import { LANGUAGES } from '../../../../../src/utils/language.js';

describe('NAIL_SEO_COPY', () => {
  it('covers every language', () => {
    for (const language of LANGUAGES) assert.ok(NAIL_SEO_COPY[language], language);
  });

  it('never uses a long dash in customer-facing copy', () => {
    for (const language of LANGUAGES) {
      const copy = NAIL_SEO_COPY[language];
      const text = [
        copy.title,
        copy.description,
        copy.h1,
        copy.intro,
        copy.view,
        copy.count(3),
        copy.related,
        copy.closing,
      ].join(' ');
      assert.ok(!/[–—]/.test(text), language);
    }
  });
});
