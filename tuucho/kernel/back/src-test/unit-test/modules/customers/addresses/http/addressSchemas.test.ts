import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addressInputFromBody,
  addressPatchFromBody,
} from '../../../../../../src/modules/customers/addresses/http/addressSchemas.js';

const LIVRAISON = {
  kind: 'livraison',
  recipientName: 'Jane Doe',
  line1: '1 rue de la Paix',
  postalCode: '75002',
  city: 'Paris',
  countryCode: 'FR',
};

test('a delivery address defaults to the home network and to saved', () => {
  const parsed = addressInputFromBody(LIVRAISON)!;
  assert.deepEqual(parsed.networkCodes, ['home']);
  assert.equal(parsed.savedForFuture, true);
  assert.equal(parsed.isDefault, false);
  assert.equal(parsed.pickupPoints, undefined);
});

test('kind must be livraison or facturation', () => {
  assert.equal(addressInputFromBody({ ...LIVRAISON, kind: undefined }), undefined);
  assert.equal(addressInputFromBody({ ...LIVRAISON, kind: 'other' }), undefined);
});

test('a billing address never carries networks, pickups or delivery notes', () => {
  const parsed = addressInputFromBody({
    ...LIVRAISON,
    kind: 'facturation',
    networkCodes: ['relay'],
    pickupPoints: { relay: { id: 'R1' } },
    deliveryNotes: 'code 1234',
  })!;
  assert.deepEqual(parsed.networkCodes, []);
  assert.deepEqual(parsed.pickupPoints, {});
  assert.equal(parsed.deliveryNotes, undefined);
});

test('optional fields: blank is absent, invalid rejects the address', () => {
  const blank = addressInputFromBody({ ...LIVRAISON, line2: ' ', phone: '', label: null })!;
  assert.equal(blank.line2, undefined);
  assert.equal(blank.phone, undefined);
  assert.equal(blank.label, undefined);
  assert.equal(addressInputFromBody({ ...LIVRAISON, phone: 'abc' }), undefined);
  assert.equal(addressInputFromBody({ ...LIVRAISON, label: 'tab\there' }), undefined);
});

test('savedForFuture is only turned off by an explicit false', () => {
  assert.equal(addressInputFromBody({ ...LIVRAISON, savedForFuture: 0 })!.savedForFuture, true);
  assert.equal(addressInputFromBody({ ...LIVRAISON, savedForFuture: false })!.savedForFuture, false);
});

test('a malformed pickup payload on a delivery address rejects it', () => {
  assert.equal(addressInputFromBody({ ...LIVRAISON, pickupPoints: null }), undefined);
  assert.equal(
    addressInputFromBody({ ...LIVRAISON, networkCodes: ['relay'], pickupPoints: { relay: { id: '' } } }),
    undefined,
  );
});

test('patch: networks and pickups cannot be edited in place', () => {
  assert.equal(addressPatchFromBody({ networkCodes: ['home'] }), undefined);
  assert.equal(addressPatchFromBody({ pickupPoints: {} }), undefined);
});

test('patch: clearing both names is refused', () => {
  assert.equal(addressPatchFromBody({ recipientName: '', companyName: '' }), undefined);
  assert.deepEqual(addressPatchFromBody({ recipientName: '', companyName: 'ACME' }), {
    recipientName: undefined,
    companyName: 'ACME',
  });
});

test('patch: only fields sent are touched, blank optional fields clear', () => {
  const patch = addressPatchFromBody({ city: 'Lyon', line2: '', phone: null })!;
  assert.deepEqual(Object.keys(patch).sort(), ['city', 'line2', 'phone']);
  assert.equal(patch.line2, undefined);
  assert.equal(patch.phone, undefined);
  assert.deepEqual(addressPatchFromBody({}), {});
});

test('patch: invalid values reject the whole patch', () => {
  assert.equal(addressPatchFromBody({ postalCode: '<script>' }), undefined);
  assert.equal(addressPatchFromBody({ phone: '12' }), undefined);
  assert.equal(addressPatchFromBody({ line2: 'bad\u0000' }), undefined);
});

test('patch: isDefault can only be set, never unset', () => {
  assert.equal(addressPatchFromBody({ isDefault: true })!.isDefault, true);
  assert.equal('isDefault' in addressPatchFromBody({ isDefault: false })!, false);
});
