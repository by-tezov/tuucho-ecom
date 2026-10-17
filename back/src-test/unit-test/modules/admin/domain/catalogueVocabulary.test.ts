import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseAxisPart,
  parseLengthPart,
  parseLibraryPart,
  parseShapePart,
  parseTranslationPart,
  parseVocabularyKey,
  VocabularyEditError,
} from '../../../../../src/modules/admin/domain/catalogueVocabulary.js';

const title = { fr: 'amande', en: 'almond' };

test('a shape keeps manager $length references, in order, without duplicates', () => {
  assert.deepEqual(
    parseShapePart({
      title,
      gender: { fr: 'f', en: '' },
      attributive: { fr: 'amande' },
      length: ['$long', 'medium', '$long'],
    }),
    {
      title,
      gender: { fr: 'f', en: '' },
      attributive: { fr: 'amande' },
      lengths: ['long', 'medium'],
    },
  );
});

test('a shape refuses lengths that are already expanded', () => {
  assert.throws(
    () =>
      parseShapePart({
        title,
        attributive: { fr: 'amande' },
        length: { medium: { value: '', title: { fr: 'moyen' } } },
      }),
    VocabularyEditError,
  );
});

test('a length keeps an empty value and requires a French title', () => {
  assert.deepEqual(parseLengthPart({ value: '', title: { fr: 'long' }, gender: { fr: 'm' } }), {
    value: '',
    title: { fr: 'long' },
    gender: { fr: 'm' },
  });
  assert.throws(() => parseLengthPart({ value: '', title: { en: 'long' } }), /title\.fr/);
});

test('a colour and a nail option are the translation, and an axis keeps only its title', () => {
  assert.deepEqual(parseTranslationPart({ fr: 'jaune', en: 'yellow' }), { fr: 'jaune', en: 'yellow' });
  assert.deepEqual(parseAxisPart({ title: { fr: 'couleur' }, option: { gold: { fr: 'or' } } }), {
    fr: 'couleur',
  });
});

test('a library part name and a kebab key are normalised', () => {
  assert.equal(parseLibraryPart('color'), 'color');
  assert.equal(parseVocabularyKey('Honey-Glow'), 'honey-glow');
  assert.throws(() => parseVocabularyKey('honey glow'), /hyphens/);
  assert.throws(() => parseLibraryPart('variation'), VocabularyEditError);
});
