/**
 * Chat presence is per audience.
 *
 * Both the customer's chat panel and the operator's admin panel subscribe to
 * the same session id, so the ops session list needs to ask about one side.
 * Before this, the CLI read a `visitorLive` field the endpoint never sent and
 * its orphan tagging could not fire; the field is real now, and this is what
 * keeps it meaning what it says.
 *
 * It lives on this rung rather than beside the module because subscribing
 * starts the LISTEN client, which needs a database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasChatSessionSubscribers,
  subscribeChatSession,
} from '../../src/modules/chat/application/chatSse.js';

test('an operator watching a session does not make the visitor look present', () => {
  const sessionId = 'presence-operator-only';
  const unsubscribe = subscribeChatSession(sessionId, () => {}, 'operator');
  try {
    assert.equal(hasChatSessionSubscribers(sessionId), true);
    assert.equal(hasChatSessionSubscribers(sessionId, 'operator'), true);
    assert.equal(hasChatSessionSubscribers(sessionId, 'visitor'), false);
  } finally {
    unsubscribe();
  }
  assert.equal(hasChatSessionSubscribers(sessionId), false);
});

test('both sides are reported independently, and unsubscribing clears only one', () => {
  const sessionId = 'presence-both-sides';
  const stopVisitor = subscribeChatSession(sessionId, () => {}, 'visitor');
  const stopOperator = subscribeChatSession(sessionId, () => {}, 'operator');
  try {
    assert.equal(hasChatSessionSubscribers(sessionId, 'visitor'), true);
    assert.equal(hasChatSessionSubscribers(sessionId, 'operator'), true);
    stopVisitor();
    assert.equal(hasChatSessionSubscribers(sessionId, 'visitor'), false);
    assert.equal(hasChatSessionSubscribers(sessionId, 'operator'), true);
  } finally {
    stopOperator();
  }
});

test('a message still reaches every subscriber once the registry is keyed', async () => {
  // The registry became a Map keyed by the subscriber, so the fan-out has to
  // iterate its keys. Iterating the Map itself would hand each entry as a
  // [subscriber, audience] pair and deliver nothing.
  const { notifyChatMessage } = await import('../../src/modules/chat/application/chatSse.js');
  const { pool } = await import('./support/stack.js');
  const sessionId = 'presence-fan-out';
  const seen: string[] = [];
  const stopVisitor = subscribeChatSession(sessionId, (event) => seen.push(`visitor:${event.type}`), 'visitor');
  const stopOperator = subscribeChatSession(sessionId, (event) => seen.push(`operator:${event.type}`), 'operator');
  try {
    await notifyChatMessage(pool, sessionId, 1, 'message');
    assert.deepEqual(seen.sort(), ['operator:message', 'visitor:message']);
  } finally {
    stopVisitor();
    stopOperator();
  }
});
