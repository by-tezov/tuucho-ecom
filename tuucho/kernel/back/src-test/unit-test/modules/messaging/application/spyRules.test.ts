import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSpyRules } from '../../../../../../../plugins/messaging/mail-spy/tuucho-mail-spy/back/src/application/spyResolve.js';

test('spy rules come only from the configured list', () => {
  assert.deepEqual(parseSpyRules(undefined), []);
  assert.deepEqual(parseSpyRules(''), []);
  assert.deepEqual(parseSpyRules('not json'), []);
  assert.deepEqual(
    parseSpyRules([
      { channel: 'login', role: 'super-admin' },
      { channel: 'login', role: 'user' },
      { channel: 'login', email: ' Ops@Shop.Example ' },
      { channel: '*', enabled: false },
      { channel: 'orders', role: 'manager', enabled: true },
      { role: 'super-admin' },
    ]),
    [
      { channel: 'login', role: 'super-admin' },
      { channel: 'login', email: 'ops@shop.example' },
      { channel: '*', enabled: false },
      { channel: 'orders', role: 'manager', enabled: true },
    ],
  );
  assert.deepEqual(parseSpyRules('[{"channel":"orders","email":"a@b.c"}]'), [
    { channel: 'orders', email: 'a@b.c' },
  ]);
});
