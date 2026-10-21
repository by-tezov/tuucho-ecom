import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptJsonPii,
  decryptPii,
  emailLookupHash,
  encryptJsonPii,
  encryptPii,
} from '../../../../src/platform/security/piiCrypto.js';

test('encrypt then decrypt returns the original, including empty and unicode', () => {
  for (const value of ['jane@example.com', '', 'Zoé · ส้ม · 🎁']) {
    assert.equal(decryptPii(encryptPii(value)), value);
  }
});

test('null and undefined pass through untouched', () => {
  assert.equal(encryptPii(null), null);
  assert.equal(encryptPii(undefined), null);
  assert.equal(decryptPii(null), null);
  assert.equal(decryptPii(undefined), null);
});

test('ciphertext is versioned and randomized (no equality leak)', () => {
  const a = encryptPii('same')!;
  const b = encryptPii('same')!;
  assert.match(a, /^v1:/);
  assert.notEqual(a, b);
  assert.equal(a.includes('same'), false);
});

test('plaintext, truncated or tampered values are refused, never returned', () => {
  assert.throws(() => decryptPii('jane@example.com'), /plaintext/);
  assert.throws(() => decryptPii('v1:AAAA'), /Corrupt/);
  const stored = encryptPii('secret')!;
  const raw = Buffer.from(stored.slice(3), 'base64');
  raw[raw.length - 20]! ^= 0x01;
  assert.throws(() => decryptPii(`v1:${raw.toString('base64')}`), /tampered/);
});

test('the email blind index ignores case and surrounding spaces', () => {
  const hash = emailLookupHash('Jane@Example.com');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(emailLookupHash('  jane@example.COM '), hash);
  assert.notEqual(emailLookupHash('jane2@example.com'), hash);
});

test('JSON helpers round-trip structured values', () => {
  const value = { line1: '1 rue', tags: ['a'], n: 2 };
  assert.deepEqual(decryptJsonPii(encryptJsonPii(value)), value);
  assert.equal(encryptJsonPii(null), null);
  assert.equal(decryptJsonPii(null), null);
});

test('optional key override encrypts for another environment without mixing keys', () => {
  const otherKey = Buffer.alloc(32, 7).toString('base64');
  const stored = encryptPii('plugin-secret', otherKey)!;
  assert.equal(decryptPii(stored, otherKey), 'plugin-secret');
  assert.throws(() => decryptPii(stored), /wrong key or tampered/);
});
