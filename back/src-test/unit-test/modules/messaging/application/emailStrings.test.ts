/**
 * Hard rule: no em dash (U+2014) or en dash (U+2013) in copy a customer can
 * read. These catalogues are clean today; this keeps them that way. Copy
 * builders are called with placeholder arguments so templated subjects are
 * checked too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EMAIL_STRINGS } from '../../../../../src/modules/messaging/application/emailStrings.js';
import { GIFT_RECEIVER_ORDER_MAIL } from '../../../../../src/modules/messaging/application/giftReceiverOrderMail.js';
import { GIFT_SHARE_CARD_MAIL } from '../../../../../src/modules/gift/domain/giftShareCardMailCopy.js';
import { GIFT_SELECT_REMINDER_MAIL } from '../../../../../src/modules/gift/domain/giftSelectReminderMailCopy.js';
import { GIVER_PROMISE_MAIL } from '../../../../../src/modules/gift/domain/giverPromiseMailCopy.js';
import { LANGUAGES } from '../../../../../src/utils/language.js';

const LONG_DASH = /[–—]/;

function collectStrings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([path, value]);
  else if (typeof value === 'function') {
    const result: unknown = (value as (...args: unknown[]) => unknown)('X', 'X', 'X', 'X');
    collectStrings(result, `${path}()`, out);
  } else if (Array.isArray(value)) value.forEach((entry, i) => collectStrings(entry, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) collectStrings(entry, `${path}.${key}`, out);
  }
}

function assertNoLongDash(name: string, catalogue: unknown) {
  const strings: Array<[string, string]> = [];
  collectStrings(catalogue, name, strings);
  assert.ok(strings.length > 0, `${name} yielded no strings`);
  const offenders = strings.filter(([, text]) => LONG_DASH.test(text)).map(([path]) => path);
  assert.deepEqual(offenders, [], `long dash in ${offenders.join(', ')}`);
}

test('every language has every email catalogue', () => {
  for (const catalogue of [
    EMAIL_STRINGS,
    GIFT_RECEIVER_ORDER_MAIL,
    GIFT_SHARE_CARD_MAIL,
    GIFT_SELECT_REMINDER_MAIL,
    GIVER_PROMISE_MAIL,
  ]) {
    assert.deepEqual(Object.keys(catalogue).sort(), [...LANGUAGES].sort());
  }
});

test('every language exposes the same email string keys as French', () => {
  const keysOf = (value: unknown, prefix = ''): string[] =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value).flatMap(([k, v]) => [`${prefix}${k}`, ...keysOf(v, `${prefix}${k}.`)])
      : [];
  const french = keysOf(EMAIL_STRINGS.fr).sort();
  const giftFrench = keysOf(GIFT_RECEIVER_ORDER_MAIL.fr).sort();
  for (const language of LANGUAGES) {
    assert.deepEqual(keysOf(EMAIL_STRINGS[language]).sort(), french, language);
    assert.deepEqual(keysOf(GIFT_RECEIVER_ORDER_MAIL[language]).sort(), giftFrench, language);
  }
});

test('email string catalogues contain no em or en dash', () => {
  assertNoLongDash('EMAIL_STRINGS', EMAIL_STRINGS);
  assertNoLongDash('GIFT_RECEIVER_ORDER_MAIL', GIFT_RECEIVER_ORDER_MAIL);
  assertNoLongDash('GIFT_SHARE_CARD_MAIL', GIFT_SHARE_CARD_MAIL);
  assertNoLongDash('GIFT_SELECT_REMINDER_MAIL', GIFT_SELECT_REMINDER_MAIL);
  assertNoLongDash('GIVER_PROMISE_MAIL', GIVER_PROMISE_MAIL);
});

const SRC = join(import.meta.dirname, '../../../../../src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test('email templates contain no em or en dash', () => {
  const files = walk(join(SRC, 'templates/emails'));
  assert.ok(files.length > 0);
  const offenders = files.filter((file) => LONG_DASH.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

/** Modules that build email, invoice, gift card and label text. Comment lines
 * are skipped: only code (where copy lives) must stay free of long dashes. */
const COPY_SOURCE_DIRS = [
  'modules/messaging',
  'modules/invoicing',
  'modules/gift',
  'modules/shipping',
  'modules/orders/application/returns',
];

test('copy-building source code contains no em or en dash outside comments', () => {
  const offenders: string[] = [];
  for (const dir of COPY_SOURCE_DIRS) {
    for (const file of walk(join(SRC, dir)).filter((f) => f.endsWith('.ts'))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (LONG_DASH.test(line)) offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}`);
        });
    }
  }
  assert.deepEqual(offenders, []);
});
