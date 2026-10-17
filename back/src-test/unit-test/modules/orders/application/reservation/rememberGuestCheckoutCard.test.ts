import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guestSavedWithRememberCard } from '../../../../../../src/modules/orders/application/reservation/rememberGuestCheckoutCard.js';
import type { CheckoutReservationSnapshot } from '../../../../../../src/modules/orders/application/reservation/checkoutReservationSnapshot.js';

function snapshot(guestSaved?: CheckoutReservationSnapshot['guestSaved']): CheckoutReservationSnapshot {
  return {
    version: 1,
    guestEmail: 'guest@example.com',
    guestSaved,
    priced: {
      networkCode: 'home',
      address: {
        recipient_name: 'Ada Lovelace',
        company_name: null,
        line1: '10 rue de Test',
        line2: null,
        delivery_notes: null,
        postal_code: '75001',
        city: 'Paris',
        country_code: 'FR',
        phone: '+33601020304',
        pickup_points: {},
      },
    },
  } as CheckoutReservationSnapshot;
}

const rememberedAddress: NonNullable<CheckoutReservationSnapshot['guestSaved']> = {
  rememberCard: false,
  rememberShipping: true,
  rememberBilling: false,
  shipping: {
    recipientName: 'Ada Lovelace',
    companyName: null,
    line1: '10 rue de Test',
    line2: null,
    deliveryNotes: null,
    postalCode: '75001',
    city: 'Paris',
    countryCode: 'FR',
    phone: '+33601020304',
    networkCodes: ['home'],
    pickupPoints: {},
    label: 'Adresse guest mémorisée',
    savedForFuture: true,
  },
  billing: null,
};

test('guest remember card: no prior opt-in stays unchanged when the box is clear', () => {
  assert.equal(guestSavedWithRememberCard(snapshot(), false), 'unchanged');
});

test('guest remember card: a card-only opt-in creates a snapshot the settle path can see', () => {
  const next = guestSavedWithRememberCard(snapshot(), true);
  assert.notEqual(next, 'unchanged');
  assert.equal(next && next !== 'unchanged' ? next.rememberCard : false, true);
  assert.equal(next && next !== 'unchanged' ? next.rememberShipping : true, false);
  assert.equal(next && next !== 'unchanged' ? next.shipping.line1 : '', '10 rue de Test');
});

test('guest remember card: checking the box keeps an address that was already remembered', () => {
  const next = guestSavedWithRememberCard(snapshot(rememberedAddress), true);
  assert.ok(next !== 'unchanged' && next);
  assert.equal(next.rememberCard, true);
  assert.equal(next.rememberShipping, true);
  assert.equal(next.shipping.label, 'Adresse guest mémorisée');
});

test('guest remember card: repeating the same choice does not rewrite the snapshot', () => {
  assert.equal(
    guestSavedWithRememberCard(snapshot({ ...rememberedAddress, rememberCard: true }), true),
    'unchanged',
  );
});
