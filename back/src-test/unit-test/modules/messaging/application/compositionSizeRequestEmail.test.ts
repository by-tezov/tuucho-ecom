import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compositionSizeRequestSpyEmail } from '../../../../../src/modules/messaging/application/compositionSizeRequestEmail.js';

const missing = {
  productUid: 'MQ-EE-204',
  title: 'Iris',
  shapeLabel: 'Amande',
  lengthLabel: 'medium',
  variationLabel: null,
  fingerLabel: 'pouce gauche',
  offered: false,
  publicId: 'PR-1',
};

const offered = {
  productUid: 'MN-EE-201',
  title: 'Rose',
  shapeLabel: 'Amande',
  lengthLabel: 'medium',
  variationLabel: null,
  fingerLabel: 'pouce droit',
  offered: true,
  publicId: null,
};

test('the spy mail names the missing nail, the nails already offered, and the asked size', () => {
  const mail = compositionSizeRequestSpyEmail({
    email: 'julie@example.test',
    userId: null,
    size: 'S',
    quantity: 2,
    comment: 'Merci de proposer cette taille.',
    nails: [missing, offered],
  });

  assert.match(mail.subject, /taille S x2/);
  assert.equal(mail.replyTo, 'julie@example.test');
  assert.equal(mail.kind, 'spy');
  assert.match(mail.text, /Non connecté/);
  assert.match(mail.text, /MQ-EE-204 Iris, Amande, medium, doigt: pouce gauche \(demande PR-1\)/);
  assert.match(mail.text, /MN-EE-201 Rose, Amande, medium, doigt: pouce droit/);
  assert.match(mail.text, /Merci de proposer cette taille/);
  assert.ok(mail.html);
  assert.match(mail.html, /Ongles non proposés dans cette taille/);
  assert.match(mail.html, /Autres ongles du set \(déjà proposés\)/);
  assert.match(mail.html, /MQ-EE-204/);
  assert.match(mail.html, /MN-EE-201/);
});

test('a signed-in request keeps the user id, a variation, and aucun when nothing else is offered', () => {
  const mail = compositionSizeRequestSpyEmail({
    email: 'a@b.test',
    userId: 'user-1',
    size: 'L',
    quantity: 1,
    nails: [{ ...missing, variationLabel: 'nuit', publicId: null, offered: false }],
  });

  assert.match(mail.text, /ID utilisateur : user-1/);
  assert.match(mail.text, /Amande, medium, nuit, doigt: pouce gauche/);
  assert.match(mail.text, /- aucun/);
  assert.equal(mail.text.includes('Commentaire'), false);
});
