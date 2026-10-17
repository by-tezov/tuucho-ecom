import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFrEmailCatalogs } from '../../../support/registerFrEmailCatalogs.js';
import {
  giftCancelledEmail,
  giftCreatedSpyEmail,
  giftReminderEmail,
  giftSelectReminderEmail,
  giverPromiseEmail,
  giverShareCardEmail,
} from '../../../../../../../plugins/tuucho/commerce/gift/tuucho-commerce-gift/back/src/infrastructure/giftMail.js';

registerFrEmailCatalogs();

const GIVER = {
  giverToken: 'giver-token',
  language: 'fr' as const,
  giverDisplayName: 'Alex',
  receiverName: 'Julie',
};

test('gift HTML mails never stringify an object into the footer', () => {
  const mails = [
    giverShareCardEmail(GIVER),
    giftCancelledEmail({ receiverName: GIVER.receiverName, language: GIVER.language }),
    giverPromiseEmail(GIVER),
    giftReminderEmail({ giverToken: GIVER.giverToken, language: GIVER.language, kind: 'hold' }),
    giftReminderEmail({ giverToken: GIVER.giverToken, language: GIVER.language, kind: 'pay' }),
    giftCreatedSpyEmail({
      offerId: '11111111-1111-4111-8111-111111111111',
      giverEmail: 'alex@example.com',
      giverDisplayName: GIVER.giverDisplayName,
      giverUserId: null,
      receiverName: GIVER.receiverName,
      giverComment: 'Pour toi',
      maxBudget: 80,
      allowAccessories: false,
      maxAccessoryBudget: null,
      hideReceiverPrices: true,
      language: 'fr',
      offerExpiresAt: null,
      shareCardStyle: 'anniversaire',
      signedIn: false,
    }),
  ];
  for (const mail of mails) {
    assert.ok(mail.html, mail.subject);
    assert.equal(mail.html.includes('[object Object]'), false, mail.subject);
  }
  assert.match(giverShareCardEmail(GIVER).html ?? '', /Cet email est envoyé automatiquement par Shop/);
  const promise = giverPromiseEmail({
    ...GIVER,
    holdExpiresAt: new Date('2026-09-18T12:00:00.000Z'),
    validUntil: new Date('2026-09-26T12:00:00.000Z'),
  }).text;
  assert.match(promise, /offre cadeau reste active jusqu.au/);
  assert.match(promise, /réservé jusqu.au[\s\S]*stock sera libéré/);
});

test('select reminder tells the giver the choice is pending, links the gift space, and offers extend only when allowed', () => {
  const base = {
    giverToken: GIVER.giverToken,
    language: GIVER.language,
    receiverName: GIVER.receiverName,
    validUntil: new Date('2026-10-20T12:00:00.000Z'),
  };
  const mail = giftSelectReminderEmail({ ...base, extendDays: 14 });
  assert.match(mail.subject, /Julie n.a pas encore choisi/);
  assert.match(mail.text, /pas encore validé de choix/);
  assert.match(mail.text, /expire le 20 octobre 2026/);
  assert.match(mail.text, /prolonger l.offre de 14 jours/);
  assert.match(mail.text, /Ton espace cadeau[\s\S]*\/giver-token/);
  assert.equal(mail.html?.includes('[object Object]'), false);

  const capped = giftSelectReminderEmail({ ...base, extendDays: null });
  assert.equal(/prolonger/.test(capped.text), false);
});
