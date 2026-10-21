import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AccessoryPackError,
  parseAccessoryType,
  parseInCartCarousel,
  parsePacksObject,
  jsonRecordEqual,
} from '../../../../../src/modules/catalog/domain/accessoryPacks.js';

test('parseAccessoryType defaults and accepts byQuantity', () => {
  assert.equal(parseAccessoryType(undefined), 'default');
  assert.equal(parseAccessoryType(null), 'default');
  assert.equal(parseAccessoryType(''), 'default');
  assert.equal(parseAccessoryType('default'), 'default');
  assert.equal(parseAccessoryType('byQuantity'), 'byQuantity');
  assert.throws(() => parseAccessoryType('other'), AccessoryPackError);
});

test('parseInCartCarousel accepts boolean true and legacy string', () => {
  assert.equal(parseInCartCarousel(true), true);
  assert.equal(parseInCartCarousel('true'), true);
  assert.equal(parseInCartCarousel(false), false);
  assert.equal(parseInCartCarousel('false'), false);
});

test('parsePacksObject rejects bad keys and non-positive multipliers', () => {
  assert.deepEqual(parsePacksObject({ pack2: 2 }), { pack2: 2 });
  assert.throws(() => parsePacksObject(null), AccessoryPackError);
  assert.throws(() => parsePacksObject({ max: 1 }), AccessoryPackError);
  assert.throws(() => parsePacksObject({ pack2: 0 }), AccessoryPackError);
  assert.throws(() => parsePacksObject({ 'bad key': 1 }), AccessoryPackError);
});

test('jsonRecordEqual compares key sets and values', () => {
  assert.equal(jsonRecordEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(jsonRecordEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(jsonRecordEqual({ a: 1 }, { a: 2 }), false);
});
