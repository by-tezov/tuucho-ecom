import { createHmac, createHash, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../../../../../src/config/env.js';
import { hashOpaqueToken } from '../../../../../src/platform/security/opaqueToken.js';
import { pinDigestInput } from '../../../../../src/modules/gift/domain/pin.js';
import { hashGiftPin, verifyGiftPin } from '../../../../../src/modules/gift/application/pinHash.js';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const OFFER_ID = '11111111-1111-4111-8111-111111111111';
const PIN = '2468';
const OTHER_PIN = '1357';

function peppered(offerId: string, pin: string): Buffer {
  return createHmac('sha256', config.pii.lookupPepper)
    .update('gift_pin_scrypt_v1\0', 'utf8')
    .update(pinDigestInput(offerId, pin), 'utf8')
    .digest();
}

async function gscrypt1Hash(offerId: string, pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(peppered(offerId, pin), salt, 64, { N: 16384, r: 8, p: 1 });
  return `gscrypt1$16384$8$1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

test('new PIN hashes are argon2id', async () => {
  const stored = await hashGiftPin(OFFER_ID, PIN);
  assert.match(stored, /^\$argon2id\$/);
});

test('argon2id verifies the matching PIN and rejects another', async () => {
  const stored = await hashGiftPin(OFFER_ID, PIN);
  assert.deepEqual(await verifyGiftPin(OFFER_ID, PIN, stored), { ok: true, needsRehash: false });
  assert.deepEqual(await verifyGiftPin(OFFER_ID, OTHER_PIN, stored), { ok: false, needsRehash: false });
});

test('a leftover peppered scrypt hash still verifies and asks for a rewrite', async () => {
  const stored = await gscrypt1Hash(OFFER_ID, PIN);
  assert.deepEqual(await verifyGiftPin(OFFER_ID, PIN, stored), { ok: true, needsRehash: true });
  assert.deepEqual(await verifyGiftPin(OFFER_ID, OTHER_PIN, stored), { ok: false, needsRehash: false });
});

test('a leftover SHA-256 pin hash still verifies and asks for a rewrite', async () => {
  const stored = hashOpaqueToken(pinDigestInput(OFFER_ID, PIN));
  assert.equal(stored.length, 64);
  assert.deepEqual(await verifyGiftPin(OFFER_ID, PIN, stored), { ok: true, needsRehash: true });
  assert.deepEqual(await verifyGiftPin(OFFER_ID, OTHER_PIN, stored), { ok: false, needsRehash: false });
});

test('unknown stored bytes are a miss', async () => {
  const noise = createHash('sha256').update('not-a-pin-hash').digest('hex') + '00';
  assert.deepEqual(await verifyGiftPin(OFFER_ID, PIN, noise), { ok: false, needsRehash: false });
});
