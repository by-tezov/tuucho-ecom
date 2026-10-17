import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../../../src/config/env.js';
import {
  LINE_COMMENT_MAX_LENGTH,
  boundedAppleNonce,
  boundedEmail,
  boundedMultilinePrintable,
  boundedOtpCode,
  boundedPassword,
  boundedPhone,
  boundedPostalCode,
  boundedPrintable,
  boundedToken,
  boundedVoucherCode,
  isPositiveIntegerAtMost,
  lineCommentOrNull,
  phoneOrNull,
} from '../../../src/utils/fieldLimits.js';

const limits = config.fieldLimits;

test('emails are trimmed, lowercased and bounded', () => {
  assert.equal(boundedEmail('Jane.Doe@Example.COM'), 'jane.doe@example.com');
  assert.equal(boundedEmail('  Jane.Doe@Example.COM '), 'jane.doe@example.com');
  assert.equal(boundedEmail('   '), undefined);
  assert.equal(boundedEmail('not-an-email'), undefined);
  assert.equal(boundedEmail(42), undefined);
  const local = 'a'.repeat(limits.emailMax);
  assert.equal(boundedEmail(`${local}@x.fr`), undefined);
});

test('passwords are kept verbatim (no trim) and bounded', () => {
  assert.equal(boundedPassword('  spaced  '), '  spaced  ');
  assert.equal(boundedPassword(''), undefined);
  assert.equal(boundedPassword('x'.repeat(config.passwordMaxLength)), 'x'.repeat(config.passwordMaxLength));
  assert.equal(boundedPassword('x'.repeat(config.passwordMaxLength + 1)), undefined);
  assert.equal(boundedPassword(null), undefined);
});

test('phones need 8 to 15 digits in an allowed format', () => {
  assert.equal(boundedPhone(' +33 6 12 34 56 78 '), '+33 6 12 34 56 78');
  assert.equal(boundedPhone('(06) 12.34-56.78'), '(06) 12.34-56.78');
  assert.equal(boundedPhone('1234567'), undefined, 'too few digits');
  assert.equal(boundedPhone('1234567890123456'), undefined, 'too many digits');
  assert.equal(boundedPhone('06 12 34 56 7a'), undefined, 'letters');
  assert.equal(boundedPhone('33+612345678'), undefined, 'plus only in front');
});

test('phoneOrNull distinguishes clear from reject', () => {
  assert.equal(phoneOrNull(null), null);
  assert.equal(phoneOrNull('   '), null);
  assert.equal(phoneOrNull('0612345678'), '0612345678');
  assert.equal(phoneOrNull('nope'), undefined);
  assert.equal(phoneOrNull(612345678), undefined);
});

test('postal codes are alphanumeric with spaces or dashes', () => {
  assert.equal(boundedPostalCode(' 75001 '), '75001');
  assert.equal(boundedPostalCode('SW1A 1AA'), 'SW1A 1AA');
  assert.equal(boundedPostalCode('1000-001'), '1000-001');
  assert.equal(boundedPostalCode('-75001'), undefined);
  assert.equal(boundedPostalCode('75<01'), undefined);
  assert.equal(boundedPostalCode('9'.repeat(limits.postalCodeMax + 1)), undefined);
});

test('voucher codes allow letters, digits, dash and underscore only', () => {
  assert.equal(boundedVoucherCode(' NOEL_2026-A '), 'NOEL_2026-A');
  assert.equal(boundedVoucherCode('NOEL 2026'), undefined);
  assert.equal(boundedVoucherCode("x';--"), undefined);
  assert.equal(boundedVoucherCode('A'.repeat(limits.voucherCodeMax + 1)), undefined);
});

test('printable text rejects control characters and blank values', () => {
  assert.equal(boundedPrintable('  hello ', 10), 'hello');
  assert.equal(boundedPrintable('   ', 10), undefined);
  assert.equal(boundedPrintable('a\u0000b', 10), undefined);
  assert.equal(boundedPrintable('line\nbreak', 20), undefined);
  assert.equal(boundedPrintable('x'.repeat(11), 10), undefined);
  assert.equal(boundedToken('t'.repeat(limits.tokenMax + 1)), undefined);
});

test('OTP codes are six digits, spaces ignored', () => {
  assert.equal(boundedOtpCode('123 456'), '123456');
  assert.equal(boundedOtpCode('12345'), undefined);
  assert.equal(boundedOtpCode('12345a'), undefined);
  assert.equal(boundedOtpCode(123456), undefined);
});

test('Apple nonce must be at least 16 characters', () => {
  assert.equal(boundedAppleNonce('short'), undefined);
  assert.equal(boundedAppleNonce('0123456789abcdef'), '0123456789abcdef');
});

test('multiline text keeps tab and line breaks, rejects other controls and line overflow', () => {
  assert.equal(boundedMultilinePrintable('Hi\n\tthere\r\n', 50), 'Hi\n\tthere\r\n');
  assert.equal(boundedMultilinePrintable('bell\u0007', 50), undefined);
  assert.equal(boundedMultilinePrintable(' \n\t ', 50), undefined);
  assert.equal(boundedMultilinePrintable('a\nb\nc', 50, 3), 'a\nb\nc');
  assert.equal(boundedMultilinePrintable('a\r\nb\rc\nd', 50, 3), undefined, 'CRLF, CR and LF all count');
  assert.equal(boundedMultilinePrintable('x'.repeat(51), 50), undefined);
});

test('cart line notes: blank clears, invalid rejects', () => {
  assert.equal(lineCommentOrNull(undefined), null);
  assert.equal(lineCommentOrNull(null), null);
  assert.equal(lineCommentOrNull('   '), null);
  assert.equal(lineCommentOrNull('  Pour Léa\nmerci  '), 'Pour Léa\nmerci');
  assert.equal(lineCommentOrNull('x'.repeat(LINE_COMMENT_MAX_LENGTH + 1)), undefined);
  assert.equal(lineCommentOrNull(5), undefined);
});

test('isPositiveIntegerAtMost only accepts safe integers in range', () => {
  assert.equal(isPositiveIntegerAtMost(1, 5), true);
  assert.equal(isPositiveIntegerAtMost(5, 5), true);
  for (const value of [0, 6, 1.5, -1, '2', Number.NaN]) {
    assert.equal(isPositiveIntegerAtMost(value, 5), false, String(value));
  }
  assert.equal(isPositiveIntegerAtMost(Number.MAX_SAFE_INTEGER + 1, Infinity), false);
});
