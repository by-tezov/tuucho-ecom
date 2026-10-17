import { describe, expect, it } from 'vitest';
import { copyContextFor, productAlt, productDesc, resolveProductCopy } from '../../../src/utils/productCopy';
import type { GalleryItem } from '../../../src/data/types';

/** A set genuinely sold in two shapes, which is the case the placeholder
 * exists for: one authored sentence, two shapes, different agreement. */
const item = {
  id: '1',
  productUid: 'aq-yz-367',
  title: 'Fleurs violettes',
  desc: 'Amande brillante violette.',
  descTemplate: '$Shape.title $g{brillant|brillante} $g{violet|violette}.',
  alt: 'Faux ongles amande violets.',
  altTemplate: 'Faux ongles $shape.title violets.',
  shape: { almond: 'amande', stiletto: 'stiletto' },
  shapeGender: { almond: 'f', stiletto: 'm' },
  shapeAttributive: { almond: 'amande', stiletto: 'stiletto' },
  lengthsByShape: { almond: { medium: 'medium' }, stiletto: { long: 'long' } },
  lengthGenderByShape: { almond: { medium: 'm' }, stiletto: { long: 'm' } },
} as unknown as GalleryItem;

describe('productDesc', () => {
  it('describes the shape the picker is on, not the set default', () => {
    expect(productDesc(item, 'almond')).toBe('Amande brillante violette.');
    expect(productDesc(item, 'stiletto')).toBe('Stiletto brillant violet.');
  });

  it('falls back to the default shape for an unknown key', () => {
    expect(productDesc(item, 'coffin')).toBe('Amande brillante violette.');
  });

  it('uses the resolved field when a set has no template yet', () => {
    const legacy = { ...item, descTemplate: '' } as GalleryItem;
    expect(productDesc(legacy, 'stiletto')).toBe('Amande brillante violette.');
  });
});

describe('$shape.attributive', () => {
  it('uses the form a sentence takes, not the chip label', () => {
    const square = {
      ...item,
      shape: { square: 'carré' },
      shapeGender: { square: 'm' },
      shapeAttributive: { square: 'carrés' },
      lengthsByShape: { square: { medium: 'medium' } },
      lengthGenderByShape: { square: { medium: 'm' } },
      descTemplate: 'Ongles $shape.attributive brillants.',
    } as unknown as GalleryItem;
    expect(productDesc(square, 'square')).toBe('Ongles carrés brillants.');
  });
});

describe('productAlt', () => {
  it('follows the same shape as the description', () => {
    expect(productAlt(item, 'stiletto')).toBe('Faux ongles stiletto violets.');
  });

  it('stays null for a set that has no authored alt text', () => {
    const none = { ...item, alt: null, altTemplate: null } as GalleryItem;
    expect(productAlt(none, 'almond')).toBeNull();
  });
});

describe('copyContextFor', () => {
  it("picks the shape's first length when none is selected", () => {
    expect(copyContextFor(item, 'stiletto')).toEqual({
      shape: { label: 'stiletto', gender: 'm', attributive: 'stiletto' },
      length: { label: 'long', gender: 'm' },
    });
  });

  it('survives a set with no shapes at all', () => {
    expect(copyContextFor({ shape: {} } as unknown as GalleryItem)).toEqual({});
  });
});

describe('resolveProductCopy', () => {
  it('renders malformed copy as written rather than swallowing the sentence', () => {
    const broken = 'Amande $g{brillante, ornée.';
    expect(resolveProductCopy(broken, copyContextFor(item, 'almond'))).toBe(broken);
  });
});
