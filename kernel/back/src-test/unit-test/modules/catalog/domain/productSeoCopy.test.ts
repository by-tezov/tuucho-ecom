import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  productSeoDescription,
  productSeoHeading,
  productSeoTitle,
} from '../../../../../src/modules/catalog/domain/productSeoCopy.js';

const context = { shape: { label: 'amande', gender: 'f' as const, attributive: 'amande' } };

describe('productSeoDescription', () => {
  it('names the product, which the authored catalogue sentence never does', () => {
    const description = productSeoDescription('$Shape.title brillante violette, ornée de strass.', {
      context,
      productUid: 'EZ-TY-739',
      language: 'fr',
      fallback: 'Fleurs violettes',
    });
    assert.match(description, /(piece artisanale|objet d atelier) amande/i);
    assert.ok(description.startsWith('P') || description.startsWith('O'));
    assert.ok(description.endsWith('Piece artisanale faite main, livree en France.'), description);
  });

  it('closes on the caller\'s sentence when one is given (a single nail is not a set)', () => {
    const description = productSeoDescription('$Shape.title rose.', {
      context,
      productUid: 'EZ-TY-739',
      language: 'fr',
      fallback: '',
      closing: 'Piece artisanale faite main, livree en France.',
    });
    assert.ok(description.endsWith('Piece artisanale faite main, livree en France.'), description);
    assert.ok(!description.includes('Set de pieces fait main'));
  });

  it('stays within a snippet, dropping the closing claim before truncating the set', () => {
    const long = `$Shape.title ${'brillante violette '.repeat(12)}.`;
    const description = productSeoDescription(long, {
      context,
      productUid: 'EZ-TY-739',
      language: 'fr',
      fallback: '',
    });
    assert.ok(description.length <= 170, description.length.toString());
    assert.ok(!description.includes('Set de pieces fait main'));
  });

  it('gives the same set the same snippet on every render', () => {
    const args = { context, productUid: 'EK-RC-695', language: 'fr' as const, fallback: '' };
    assert.equal(
      productSeoDescription('$Shape.title brillante.', args),
      productSeoDescription('$Shape.title brillante.', args),
    );
  });

  it('adds the noun only when the sentence opens on the shape, never doubling one the copy names', () => {
    const coffin = { shape: { label: 'coffin', gender: '' as const, attributive: 'coffin' } };
    const english = productSeoDescription('Glossy $shape.title nails in deep cherry red.', {
      context: coffin,
      productUid: 'EK-RC-695',
      language: 'en',
      fallback: '',
    });
    assert.ok(english.startsWith('Glossy coffin nails in deep cherry red.'), english);
    const frenchCoffin = { shape: { label: 'cercueil', gender: 'm' as const, attributive: 'cercueil' } };
    const french = productSeoDescription('Ongles $shape.title brillants', {
      context: frenchCoffin,
      productUid: 'EK-RC-695',
      language: 'fr',
      fallback: '',
    });
    assert.ok(french.startsWith('Ongles cercueil brillants'), french);
  });

  it('falls back when the set has no authored description', () => {
    const description = productSeoDescription('', {
      context,
      productUid: 'EK-RC-695',
      language: 'fr',
      fallback: 'Rayures dorées 3D. Toute la collection.',
    });
    assert.match(description, /^Rayures dorées 3D\./);
  });
});

describe('productSeoTitle', () => {
  it('adds the term the set name alone could never rank on', () => {
    assert.equal(
      productSeoTitle('Rayures dorées 3D', { shapeWord: 'stiletto', language: 'fr' }),
      'Rayures dorées 3D, piece artisanale stiletto · Shop',
    );
  });

  it('drops the shape, then the term, rather than overflowing the result', () => {
    const long = productSeoTitle('Fleurs violettes strassées et dorées', {
      shapeWord: 'ballerine',
      language: 'fr',
    });
    assert.ok(long.length <= 65, long);
    assert.ok(!long.includes('ballerine'));
  });

  it('puts the shape where each language puts it, in the form that goes with "nails"', () => {
    assert.equal(
      productSeoTitle('Cherries and Stripes', { shapeWord: 'coffin', language: 'en' }),
      'Cherries and Stripes, coffin handmade piece · Shop',
    );
    assert.equal(
      productSeoTitle('Cerises et rayures', { shapeWord: 'carrés', language: 'fr' }),
      'Cerises et rayures, piece artisanale carrés · Shop',
    );
  });

  it('keeps the set name when nothing else fits', () => {
    const veryLong = 'Un nom de set beaucoup trop long pour laisser la moindre place au reste';
    assert.equal(productSeoTitle(veryLong, { shapeWord: 'amande', language: 'fr' }), `${veryLong} · Shop`);
  });
});

describe('productSeoHeading', () => {
  it('says what the page is, in the words people search with', () => {
    assert.equal(productSeoHeading('stiletto', 'fr'), 'Piece artisanale stiletto');
    assert.equal(productSeoHeading('coffin', 'en'), 'Coffin handmade piece');
    assert.equal(productSeoHeading(undefined, 'en'), 'Handmade piece');
  });
});
