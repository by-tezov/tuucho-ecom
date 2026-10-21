import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveProductCopy,
} from '../../../../../src/modules/catalog/domain/productCopy.js';

const amande = { shape: { label: 'amande', gender: 'f' as const, attributive: 'amande' } };
const stiletto = { shape: { label: 'stiletto', gender: 'm' as const, attributive: 'stiletto' } };
const carre = { shape: { label: 'carré', gender: 'm' as const, attributive: 'carrés' } };

describe('resolveProductCopy', () => {
  it('puts the shape the page shows into a sentence written for any of them', () => {
    const authored = '$Shape.title brillante violette, ornée de strass.';
    assert.equal(resolveProductCopy(authored, amande), 'Amande brillante violette, ornée de strass.');
  });

  it('agrees with the shape, which is why the vocabulary carries a gender', () => {
    const authored = '$Shape.title $g{brillant|brillante} violet$g{|te}, $g{orné|ornée} de strass.';
    assert.equal(resolveProductCopy(authored, amande), 'Amande brillante violette, ornée de strass.');
    assert.equal(resolveProductCopy(authored, stiletto), 'Stiletto brillant violet, orné de strass.');
  });

  it('falls back to the unmarked variant for a language that does not mark gender', () => {
    const authored = 'Glossy $shape.title $g{painted|painted} by hand.';
    assert.equal(
      resolveProductCopy(authored, { shape: { label: 'almond', gender: '' } }),
      'Glossy almond painted by hand.',
    );
  });

  it('keeps Dutch common gender on the unmarked variant', () => {
    assert.equal(
      resolveProductCopy('$g{de|het} $shape.title', { shape: { label: 'amandelvorm', gender: 'c' } }),
      'de amandelvorm',
    );
  });

  it('leaves no double space or floating comma when there is no shape at all', () => {
    assert.equal(resolveProductCopy('Set $shape.title , peint main.', {}), 'Set, peint main.');
  });

  it('renders malformed copy as written rather than swallowing the sentence', () => {
    const authored = 'Amande $g{brillante, ornée de strass.';
    assert.equal(resolveProductCopy(authored, amande), authored);
  });

  it('uses the form a sentence takes for $shape.attributive, not the chip label', () => {
    // « Ongles carré » is what substituting the label would give.
    assert.equal(resolveProductCopy('Ongles $shape.attributive brillants.', carre), 'Ongles carrés brillants.');
    assert.equal(resolveProductCopy('$Shape.attributive brillantes.', amande), 'Amande brillantes.');
  });

  it('falls back to the label when the vocabulary declares no attributive form', () => {
    assert.equal(
      resolveProductCopy('Ongles $shape.attributive', { shape: { label: 'carré', gender: 'm' } }),
      'Ongles carré',
    );
  });
});
