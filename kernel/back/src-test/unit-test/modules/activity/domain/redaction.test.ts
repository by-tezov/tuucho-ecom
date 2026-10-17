import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DETAIL_MAX_BYTES, TARGETS_CAP } from '../../../../../src/modules/activity/domain/catalogue.js';
import {
  boundTargets,
  redactAndCapDetail,
  sanitizeSourceCommand,
} from '../../../../../src/modules/activity/domain/redaction.js';

describe('activity redaction', () => {
  it('redacts sensitive keys recursively', () => {
    const out = redactAndCapDetail({
      amount: 12,
      password: 'secret',
      nested: { stripeToken: 'tok_x', ok: true },
    });
    assert.equal(out.amount, 12);
    assert.equal(out.password, '[redacted]');
    assert.deepEqual(out.nested, { stripeToken: '[redacted]', ok: true });
  });

  it('caps oversized detail', () => {
    const fat = { blob: 'x'.repeat(DETAIL_MAX_BYTES + 1000) };
    const out = redactAndCapDetail(fat);
    assert.equal(out.truncated, true);
    assert.ok(Buffer.byteLength(JSON.stringify(out), 'utf8') <= DETAIL_MAX_BYTES);
  });

  it('bounds targets at the cap', () => {
    const many = Array.from({ length: TARGETS_CAP + 5 }, (_, i) => `uid-${i}`);
    const bounded = boundTargets(many);
    assert.equal(bounded.targets.length, TARGETS_CAP);
    assert.equal(bounded.targetsTruncated, true);
    assert.deepEqual(boundTargets(['a', 'b']), { targets: ['a', 'b'], targetsTruncated: false });
  });

  it('sanitizes source command secrets', () => {
    assert.equal(
      sanitizeSourceCommand(['npm', 'run', 'user', '--token=abc', 'plain']),
      'npm run user --token=[redacted] plain',
    );
    assert.equal(sanitizeSourceCommand(null), null);
  });
});
