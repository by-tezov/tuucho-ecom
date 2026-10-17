import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CatalogueDocumentError,
  documentToImportBody,
  emptyCatalogueTemplate,
  extractPhotoSlots,
  formatCatalogueJson,
  isBlankProductUid,
  listRowToDocument,
  pickUnusedProductUid,
  randomProductUid,
  type CatalogueSourceRow,
} from '../../../../../src/modules/admin/domain/catalogueDocument.js';

const title = {
  fr: 'Titre',
  en: 'Title',
  th: 'ชื่อ',
  es: 'Título',
  it: 'Titolo',
  nl: 'Titel',
  pt: 'Título',
};
const desc = {
  fr: 'Description $shape.title',
  en: 'Description $shape.title',
  th: 'คำอธิบาย',
  es: 'Descripción',
  it: 'Descrizione',
  nl: 'Beschrijving',
  pt: 'Descrição',
};
const occasion = {
  fr: 'été',
  en: 'summer',
  th: 'ฤดูร้อน',
  es: 'verano',
  it: 'estate',
  nl: 'zomer',
  pt: 'verão',
};

function baseRow(overrides: Partial<CatalogueSourceRow> = {}): CatalogueSourceRow {
  return {
    productUid: 'AA-BB-001',
    title,
    desc,
    occasion,
    alt: null,
    shapeLengths: { almond: ['medium'] },
    colorMainKeys: ['green'],
    colorSecondaryKeys: [],
    hidden: false,
    hiddenShapeLengths: [],
    featuredFrom: null,
    featuredFor: null,
    creationDate: '2026-01-01',
    photoHashes: { almond: { medium: ['a'.repeat(64)] } },
    price: 12.5,
    availability: { almond: { medium: { M: 2 } } },
    accessoryType: 'default',
    accessoryPacks: {},
    accessoryPackPrices: {},
    inCartCarousel: false,
    loyaltyMultiplier: 1,
    variationAxis: null,
    variations: [],
    users: [],
    ...overrides,
  };
}

test('formatCatalogueJson pretty-prints and rejects bad JSON', () => {
  const pretty = formatCatalogueJson('{"product-uid":"AA-BB-001","price":1}');
  assert.match(pretty, /"product-uid": "AA-BB-001"/);
  assert.match(pretty, /\n/);
  assert.throws(() => formatCatalogueJson('{'), CatalogueDocumentError);
});

test('library document round-trips through import body', () => {
  const document = {
    'product-uid': 'AA-BB-001',
    'creation-date': '2026-01-01',
    price: 12.5,
    title,
    desc,
    occasion,
    'color-main': ['$green'],
    available: { $almond: { $medium: { M: 2 } } },
    photos: {
      $almond: {
        $medium: [{ photo: '1', hash: 'a'.repeat(64) }],
      },
    },
  };
  const body = documentToImportBody('library', document, { update: true });
  assert.equal(body.productUid, 'AA-BB-001');
  assert.equal(body.productType, 'nail');
  assert.equal(body.audience, 'public');
  assert.deepEqual(body.shapeKeys, ['almond']);
  assert.deepEqual(body.shapeLengths, { almond: ['medium'] });
  assert.deepEqual(body.colorMainKeys, ['green']);
  assert.equal(body.update, true);
  assert.equal(body.refreshPhotos, false);

  const slots = extractPhotoSlots('library', document);
  assert.equal(slots.length, 1);
  assert.equal(slots[0]!.photo, '1');
  assert.equal(slots[0]!.shapeKey, 'almond');

  const loaded = listRowToDocument('library', baseRow());
  assert.equal(loaded['product-uid'], 'AA-BB-001');
  assert.equal((loaded.photos as Record<string, unknown>)['$almond'] !== undefined, true);
});

test('user-library document keeps users and audience', () => {
  const document = {
    'product-uid': 'AA-BB-002',
    users: ['client@example.com'],
    title,
    desc,
    occasion,
    available: { $almond: { $medium: { S: 1 } } },
    photos: { $almond: { $medium: [{ photo: '1', hash: 'b'.repeat(64) }] } },
  };
  const body = documentToImportBody('user-library', document, { update: false });
  assert.equal(body.audience, 'user-library');
  assert.deepEqual(body.users, ['client@example.com']);
  const loaded = listRowToDocument('user-library', baseRow({ users: ['client@example.com'] }));
  assert.deepEqual(loaded.users, ['client@example.com']);
});

test('nail variation document maps options and photo slots', () => {
  const document = {
    'product-uid': 'NL-AA-001',
    'is-variation': true,
    price: { default: 2.1, '$honey-glow': 2.5 },
    title,
    desc,
    occasion,
    available: { $almond: { $medium: { M: true } } },
    '$color.honey-glow': {
      title,
      desc,
      occasion,
      photos: {
        $almond: {
          $medium: [{ photo: '1', hash: 'c'.repeat(64) }],
        },
      },
    },
  };
  const body = documentToImportBody('nail', document, { update: true });
  assert.equal(body.productType, 'nail_single');
  assert.equal(body.variationAxis, 'color');
  assert.equal((body.variations as Array<{ key: string }>)[0]!.key, 'honey-glow');
  assert.equal(body.price, 2.1);
  const slots = extractPhotoSlots('nail', document);
  assert.equal(slots[0]!.variationKey, 'honey-glow');

  const loaded = listRowToDocument(
    'nail',
    baseRow({
      productUid: 'NL-AA-001',
      variationAxis: 'color',
      variations: [
        {
          key: 'honey-glow',
          price: 2.5,
          title,
          desc,
          alt: null,
          occasion,
          colorMainKeys: [],
          colorSecondaryKeys: [],
        },
      ],
      photoHashes: { almond: { 'medium/honey-glow': ['c'.repeat(64)] } },
      availability: { almond: { medium: { M: 1 } } },
    }),
  );
  assert.equal(loaded['is-variation'], true);
  assert.ok(loaded['$color.honey-glow']);
});

test('accessory default and byQuantity documents', () => {
  const simple = {
    'product-uid': 'TK-PT-248',
    available: 10,
    price: 3,
    title,
    desc,
    photos: [{ photo: '1', hash: 'd'.repeat(64) }],
  };
  const body = documentToImportBody('accessory', simple, { update: true });
  assert.equal(body.productType, 'accessory');
  assert.equal(body.availability, 10);
  assert.equal(body.accessoryType, 'default');

  const packs = {
    'product-uid': 'TS-KX-936',
    type: 'byQuantity',
    available: { max: 100, x5: 5, x10: 10 },
    price: { x5: 1, x10: 1.5 },
    inCartCarousel: true,
    title,
    desc,
    photos: {
      x5: [{ photo: '1', hash: 'e'.repeat(64) }],
      x10: [{ photo: '1', hash: 'f'.repeat(64) }],
    },
  };
  const packBody = documentToImportBody('accessory', packs, { update: true });
  assert.equal(packBody.accessoryType, 'byQuantity');
  assert.deepEqual(packBody.accessoryPacks, { x5: 5, x10: 10 });
  assert.equal(packBody.inCartCarousel, true);
  assert.equal(extractPhotoSlots('accessory', packs).length, 2);

  const loaded = listRowToDocument(
    'accessory',
    baseRow({
      productUid: 'TS-KX-936',
      accessoryType: 'byQuantity',
      accessoryPacks: { x5: 5, x10: 10 },
      accessoryPackPrices: { x5: 1, x10: 1.5 },
      availability: { '': { '': { '': 100 } } },
      photoHashes: { x5: { '': ['e'.repeat(64)] }, x10: { '': ['f'.repeat(64)] } },
      inCartCarousel: true,
      shapeLengths: {},
      colorMainKeys: [],
    }),
  );
  assert.equal(loaded.type, 'byQuantity');
  assert.equal(loaded.inCartCarousel, true);
});

test('unknown keys and empty template', () => {
  assert.throws(
    () => documentToImportBody('library', { 'product-uid': 'AA-BB-001', typo: 1, title, desc, occasion, available: { $almond: { $medium: { M: 1 } } }, photos: { $almond: { $medium: [{ photo: '1' }] } } }, { update: false }),
    /Unknown key "typo"/,
  );
  const template = emptyCatalogueTemplate('library');
  assert.equal(template['product-uid'], '');
  assert.ok(template.title);
});

test('a blank product-uid is generated in the manager alphabet and skips taken codes', async () => {
  assert.equal(isBlankProductUid(''), true);
  assert.equal(isBlankProductUid('  '), true);
  assert.equal(isBlankProductUid(undefined), true);
  assert.equal(isBlankProductUid('aq-yz-367'), false);
  const pattern = /^[ACEGHJKLMQRSTUWXYZ]{2}-[ACEGHJKLMQRSTUWXYZ]{2}-[23456789]{3}$/;
  assert.match(randomProductUid(() => 0), pattern);
  let calls = 0;
  const uid = await pickUnusedProductUid((candidate) => candidate.endsWith('222'), () => {
    calls += 1;
    return calls <= 7 ? 0 : 0.5;
  });
  assert.match(uid, pattern);
  assert.equal(uid.endsWith('222'), false);
});
