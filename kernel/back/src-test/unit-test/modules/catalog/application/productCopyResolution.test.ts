import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLocalizedCopy,
  resolveTrilingualCopy,
  type CopyVocabulary,
} from '../../../../../src/modules/catalog/application/productCopyResolution.js';

const vocabulary: CopyVocabulary = {
  shapes: new Map([
    [
      'almond',
      {
        shape_key: 'almond',
        label: { fr: 'amande', en: 'almond' },
        gender: { fr: 'f', en: '' },
        attributive: { fr: 'amandes', en: 'almond' },
      },
    ],
  ]),
  lengths: new Map([
    [
      'almond|short',
      { shape_key: 'almond', length_key: 'short', label: { fr: 'court', en: 'short' }, gender: { fr: 'm' } },
    ],
  ]),
};

test('resolveLocalizedCopy replaces shape tokens and agreement for the line shape', () => {
  assert.equal(
    resolveLocalizedCopy(
      { fr: '$Shape.title brillant$g{|e}, pieces $shape.attributive.' },
      vocabulary,
      'almond',
      'short',
      'fr',
    ),
    'Amande brillante, pieces amandes.',
  );
});

test('resolveLocalizedCopy drops tokens for an unknown or missing shape', () => {
  assert.equal(resolveLocalizedCopy({ fr: '$Shape.title rose.' }, vocabulary, null, null, 'fr'), 'rose.');
  assert.equal(resolveLocalizedCopy({ fr: '$Shape.title rose.' }, vocabulary, 'square', '', 'fr'), 'rose.');
});

test('resolveTrilingualCopy resolves each language against its own vocabulary', () => {
  assert.deepEqual(
    resolveTrilingualCopy(
      { fr: '$Shape.title $length.title', en: '$Length.title $shape.title' },
      vocabulary,
      'almond',
      'short',
    ),
    { fr: 'Amande court', en: 'Short almond' },
  );
});

test('resolving already-resolved copy is a no-op', () => {
  const text = { fr: 'Amande turquoise, finition brillante.' };
  assert.deepEqual(resolveTrilingualCopy(text, vocabulary, 'almond', 'short'), text);
});
