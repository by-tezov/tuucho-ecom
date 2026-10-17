import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compositionEmailView } from '../../../../../src/modules/messaging/application/orderEmailComposition.js';
import { renderEmailTemplate } from '../../../../../src/modules/messaging/application/emailTemplates.js';

const nails = [
  {
    title: 'Cat eye',
    productUid: 'NL-EE-005',
    shapeLabel: 'Amande',
    lengthLabel: 'Medium',
    finger: 'left-pinky',
    photo: 'https://example.test/pinky.webp',
    variationLabel: 'Couleur : Rose',
  },
  {
    title: 'Finition',
    productUid: 'NL-FF-006',
    shapeLabel: 'Ovale',
    lengthLabel: 'Medium',
    finger: 'right-thumb',
    photo: null,
    variationLabel: '',
  },
];

test('compositionEmailView lays the ten fingers out like the shop mosaic', () => {
  const view = compositionEmailView(nails, 'fr');
  assert.equal(view.nailCountLabel, '2 / 10 ongles');
  assert.equal(view.mosaicRows.length, 2);
  assert.deepEqual(view.mosaicRows[0]!.cells[0], { photo: 'https://example.test/pinky.webp', filled: true });
  assert.deepEqual(view.mosaicRows[0]!.cells[4], { photo: null, filled: false });
  assert.deepEqual(view.mosaicRows[1]!.cells[0], { photo: null, filled: true });
  assert.deepEqual(
    view.hands.map((hand) => [hand.label, hand.nails.map((nail) => nail.fingerLabel)]),
    [
      ['Main gauche', ['Auriculaire gauche']],
      ['Main droite', ['Pouce droit']],
    ],
  );
  assert.equal(view.hands[0]!.nails[0]!.shapeLengthLabel, 'Amande · Medium');
});

test('the order items table renders a composed set with its mosaic and hands', () => {
  const html = renderEmailTemplate('orderConfirmationCustomer', 'fr', {
    itemGroups: [
      {
        title: 'Set composé',
        sectionLabel: 'Sets composés',
        sizes: [{ size: 'M', quantity: 1, lineTotal: 3 }],
        nails,
        groupTotal: 3,
        sizeLabel: 'taille',
        refLabel: 'Réf.',
        composition: compositionEmailView(nails, 'fr'),
      },
    ],
    total: 3,
  });
  assert.ok(html.includes('Main gauche'));
  assert.ok(html.includes('Auriculaire gauche'));
  assert.ok(html.includes('2 / 10 ongles'));
  assert.ok(html.includes('taille M'));
  assert.ok(html.includes('Réf. NL-EE-005'));
  assert.equal((html.match(/width="16" height="21"/g) ?? []).length, 10 + 1);
  assert.equal(html.includes('left-pinky'), false);
});
