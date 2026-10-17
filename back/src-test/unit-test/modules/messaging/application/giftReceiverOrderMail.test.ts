import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderConfirmationEmail,
  orderShippedEmail,
  orderUpdatedEmail,
} from '../../../../../src/modules/messaging/application/email.js';
import {
  giftReceiverCancelledEmail,
  giftReceiverReceivedEmail,
} from '../../../../../src/modules/messaging/application/giftReceiverOrderMail.js';
import type { OrderEmailData } from '../../../../../src/modules/messaging/application/orderEmailData.js';

function order(): OrderEmailData {
  return {
    orderNumber: 'PS-1',
    total: 29,
    courierName: 'Colissimo',
    express: false,
    shippingFee: 5,
    recipientName: 'Julie',
    companyName: null,
    line1: '1 rue du Cadeau',
    line2: null,
    postalCode: '75001',
    city: 'Paris',
    countryCode: 'FR',
    integrityToken: 'ABCD-1234-EFGH-5678',
    billingSameAsShipping: false,
    billingRecipientName: 'Marc',
    billingLine1: '2 avenue',
    billingPostalCode: '69001',
    billingCity: 'Lyon',
    billingCountryCode: 'FR',
    items: [
      {
        productId: 'paid',
        productUid: 'PS-ROSE',
        title: 'Rose',
        shapeKey: 'almond',
        shapeLabel: 'Amande',
        lengthKey: 'medium',
        lengthLabel: 'Moyen',
        size: 'M',
        quantity: 1,
        unitPrice: 24,
        lineTotal: 24,
        origin: 'user',
        locked: true,
      },
      {
        productId: 'rule',
        productUid: 'PS-FREE',
        title: 'Vernis',
        shapeKey: '',
        size: '',
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
        origin: 'rule',
        locked: true,
      },
    ],
  };
}

test('the payer confirmation is a priced order and keeps the integrity code', () => {
  const mail = orderConfirmationEmail(order(), 'fr', false);
  const body = `${mail.subject}\n${mail.text}\n${mail.html}`;
  assert.match(mail.subject, /commande/);
  assert.match(body, /ABCD-1234-EFGH-5678/);
  assert.match(body, /24\.00 €/);
  assert.match(body, /Vernis · Gratuit/);
  assert.doesNotMatch(body, /Rose · Gratuit/);
});

test('the receiver confirmation is a gift, with products and no prices or integrity code', () => {
  const mail = orderConfirmationEmail(order(), 'fr', false, undefined, { forGiftReceiver: true });
  const body = `${mail.subject}\n${mail.text}\n${mail.html}`;
  assert.match(mail.subject, /cadeau/);
  assert.doesNotMatch(mail.subject, /commande/i);
  assert.match(body, /Rose/);
  assert.match(body, /Vernis/);
  assert.doesNotMatch(body, /ABCD-1234-EFGH-5678/);
  assert.doesNotMatch(body, /Gratuit/);
  assert.doesNotMatch(body, /€/);
  assert.doesNotMatch(body, /Marc/);
  assert.match(body, /Julie/);
});

test('later receiver mail stays a gift notice', () => {
  const data = order();
  const shipped = orderShippedEmail(data, 'fr', undefined, { forGiftReceiver: true });
  const updated = orderUpdatedEmail(data, 'fr', { forGiftReceiver: true });
  const cancelled = giftReceiverCancelledEmail(data.orderNumber, 'fr');
  const received = giftReceiverReceivedEmail(data.orderNumber, 'fr');
  for (const mail of [shipped, updated, cancelled, received]) {
    const body = `${mail.subject}\n${mail.text}\n${mail.html}`;
    assert.match(mail.subject, /cadeau/);
    assert.doesNotMatch(mail.subject, /commande/i);
    assert.doesNotMatch(body, /€/);
    assert.doesNotMatch(body, /ABCD-1234-EFGH-5678/);
  }
  assert.match(updated.html ?? '', /Ton cadeau/);
  assert.doesNotMatch(updated.html ?? '', /Articles commandés/);
  assert.doesNotMatch(`${cancelled.text}\n${cancelled.html}`, /paiement/i);
  assert.doesNotMatch(`${received.text}\n${received.html}`, /facture/i);
});
