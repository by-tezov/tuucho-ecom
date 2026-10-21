import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expandNailAvailability,
  InvalidNailVariation,
  parseNailVariationPayload,
} from '../../../../../src/modules/operations/application/nailVariationImport.js';
import { nailUnitPrice } from '../../../../../src/modules/catalog/application/productVariations.js';

const all = { XS: 1, S: 1, M: 1, L: 1 } as const;
const base = { almond: { medium: { ...all }, long: { ...all } }, square: { short: { ...all } } };

describe('parseNailVariationPayload', () => {
  it('reads no axis as a nail without variations', () => {
    assert.deepEqual(parseNailVariationPayload({}), { axisKey: null, options: [], off: {} });
  });

  it('keeps option order and price overrides', () => {
    const payload = parseNailVariationPayload({
      variationAxis: 'color',
      variations: [{ key: 'pink' }, { key: 'gold', price: 4.5 }],
    });
    assert.deepEqual(payload.options, [
      { key: 'pink', price: null, copy: null },
      { key: 'gold', price: 4.5, copy: null },
    ]);
  });

  it("reads each option's own copy and colours", () => {
    const payload = parseNailVariationPayload({
      variationAxis: 'color',
      variations: [
        {
          key: 'black-cherry',
          title: { fr: 'Cerise noire' },
          desc: { fr: 'Ongles $shape.attributive cerise.' },
          occasion: { fr: 'soirée' },
          colorMainKeys: ['burgundy'],
          colorSecondaryKeys: [],
        },
      ],
    });
    assert.deepEqual(payload.options[0]!.copy, {
      title: { fr: 'Cerise noire' },
      desc: { fr: 'Ongles $shape.attributive cerise.' },
      alt: null,
      occasion: { fr: 'soirée' },
      colorMainKeys: ['burgundy'],
      colorSecondaryKeys: [],
    });
  });

  it('refuses an option copy without a French title, desc or occasion', () => {
    assert.throws(
      () =>
        parseNailVariationPayload({
          variationAxis: 'color',
          variations: [
            { key: 'a', title: { fr: 'A' }, desc: { en: 'only english' }, occasion: { fr: 'soirée' } },
          ],
        }),
      InvalidNailVariation,
    );
  });

  it('refuses duplicate keys and an off tree naming an unknown option', () => {
    assert.throws(
      () => parseNailVariationPayload({ variationAxis: 'color', variations: [{ key: 'a' }, { key: 'a' }] }),
      InvalidNailVariation,
    );
    assert.throws(
      () =>
        parseNailVariationPayload({
          variationAxis: 'color',
          variations: [{ key: 'a' }],
          variationOff: { b: false },
        }),
      InvalidNailVariation,
    );
  });
});

describe('expandNailAvailability', () => {
  it('keeps one empty-key grid for a nail without variations', () => {
    assert.deepEqual(expandNailAvailability(base, { axisKey: null, options: [], off: {} }), { '': base });
  });

  it('switches options off at the whole, shape, length and size levels', () => {
    const expanded = expandNailAvailability(base, {
      axisKey: 'color',
      options: [
        { key: 'night', price: null, copy: null },
        { key: 'gold', price: null, copy: null },
        { key: 'emerald', price: null, copy: null },
      ],
      off: { night: false, gold: { square: false }, emerald: { almond: { long: { XS: false } } } },
    });
    assert.deepEqual(expanded.night, {});
    assert.deepEqual(Object.keys(expanded.gold!), ['almond']);
    assert.equal(expanded.emerald!.almond!.long!.XS, undefined);
    assert.equal(expanded.emerald!.almond!.long!.S, 1);
    assert.equal(expanded.emerald!.square!.short!.XS, 1);
  });
});

describe('nailUnitPrice', () => {
  const variations = {
    axisKey: 'color',
    axisTitle: { fr: 'couleur' },
    options: new Map([
      ['pink', { title: { fr: 'rose' }, price: null, productTitle: null }],
      ['gold', { title: { fr: 'or' }, price: 4.5, productTitle: null }],
    ]),
  };
  it('uses the option override, else the product price', () => {
    assert.equal(nailUnitPrice(3, variations, 'gold'), 4.5);
    assert.equal(nailUnitPrice(3, variations, 'pink'), 3);
    assert.equal(nailUnitPrice(3, undefined, ''), 3);
  });
});
