import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeadlock, withDeadlockRetry } from '../../../../../src/modules/commerce/application/deadlockRetry.js';

const deadlock = () => Object.assign(new Error('deadlock detected'), { code: '40P01' });

test('a deadlock is recognised only by its SQLSTATE', () => {
  assert.equal(isDeadlock(deadlock()), true);
  assert.equal(isDeadlock(Object.assign(new Error('nope'), { code: '23505' })), false);
  assert.equal(isDeadlock(new Error('deadlock detected')), false, 'the message alone proves nothing');
  assert.equal(isDeadlock(null), false);
});

test('a transaction that succeeds first time runs once', async () => {
  let calls = 0;
  const result = await withDeadlockRetry(async () => {
    calls += 1;
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('a deadlock victim is retried and its result returned', async () => {
  let calls = 0;
  const result = await withDeadlockRetry(async () => {
    calls += 1;
    if (calls < 3) throw deadlock();
    return 'reserved';
  });
  assert.equal(result, 'reserved');
  assert.equal(calls, 3);
});

test('any other failure is rethrown at once, never retried', async () => {
  let calls = 0;
  await assert.rejects(
    withDeadlockRetry(async () => {
      calls += 1;
      throw Object.assign(new Error('out of stock'), { code: '23514' });
    }),
    /out of stock/,
  );
  assert.equal(calls, 1, 'retrying a real failure would just repeat it');
});

test('a persistent deadlock gives up rather than looping forever', async () => {
  let calls = 0;
  await assert.rejects(
    withDeadlockRetry(async () => {
      calls += 1;
      throw deadlock();
    }),
    /deadlock detected/,
  );
  assert.equal(calls, 3, 'a lock-ordering bug must surface, not hide behind latency');
});
