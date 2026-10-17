import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailLogRecord, type EmailLogDraft } from '../../../../src/platform/http/emailLog.js';

function draft(overrides: Partial<EmailLogDraft> = {}): EmailLogDraft {
  return {
    kind: 'user',
    channel: 'smtp',
    outcome: 'sent',
    to: 'alice@example.com',
    from: 'shop@example.com',
    replyTo: 'reply@example.com',
    subject: 'Commande pour alice@example.com',
    text: 'Bonjour Alice. Écris à alice@example.com ou au +33 6 12 34 56 78.',
    html: true,
    attachmentNames: ['invoice-alice@example.com.pdf'],
    error: null,
    ...overrides,
  };
}

test('dev keeps the addresses and only hides credential-shaped keys', () => {
  const record = buildEmailLogRecord(draft(), 'secrets');
  assert.equal(record.to, 'alice@example.com');
  assert.equal(record.subject, 'Commande pour alice@example.com');
  assert.match(String(record.text), /Bonjour Alice/);
  assert.match(String(record.text), /alice@example.com/);
  assert.deepEqual(record.attachmentNames, ['invoice-alice@example.com.pdf']);
});

test('production anonymises emails and phones the same way as the API journal', () => {
  const record = buildEmailLogRecord(draft({ error: 'smtp failed for alice@example.com' }), 'anonymous');
  assert.equal(record.to, '[REDACTED]');
  assert.equal(record.from, '[REDACTED]');
  assert.equal(record.replyTo, '[REDACTED]');
  assert.equal(record.subject, 'Commande pour [REDACTED]');
  assert.match(String(record.text), /Bonjour Alice/);
  assert.doesNotMatch(String(record.text), /alice@example.com/);
  assert.doesNotMatch(String(record.text), /\+33/);
  assert.equal(record.error, 'smtp failed for [REDACTED]');
  assert.deepEqual(record.attachmentNames, ['[REDACTED]']);
  assert.equal(record.kind, 'user');
  assert.equal(record.outcome, 'sent');
});

test('production stores a known account email as the user id', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const record = buildEmailLogRecord(
    draft({ error: 'smtp failed for Alice@Example.com' }),
    'anonymous',
    new Map([['alice@example.com', userId]]),
  );
  assert.equal(record.to, userId);
  assert.equal(record.from, '[REDACTED]');
  assert.equal(record.replyTo, '[REDACTED]');
  assert.equal(record.subject, `Commande pour ${userId}`);
  assert.match(String(record.text), /Bonjour Alice/);
  assert.match(String(record.text), new RegExp(userId));
  assert.doesNotMatch(String(record.text), /alice@example.com/i);
  assert.doesNotMatch(String(record.text), /\+33/);
  assert.equal(record.error, `smtp failed for ${userId}`);
  assert.deepEqual(record.attachmentNames, ['[REDACTED]']);
});

test('a long body is cut and marked', () => {
  const record = buildEmailLogRecord(draft({ text: 'a'.repeat(40_000) }), 'secrets');
  assert.equal(record.textTruncated, true);
  assert.ok(Buffer.byteLength(String(record.text)) <= 32 * 1024);
});
