/**
 * Hard rule: no em dash (U+2014) or en dash (U+2013) in copy a customer can
 * read. These catalogues are clean today; this keeps them that way. Copy
 * builders are called with placeholder arguments so templated subjects are
 * checked too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { enEmail } from '../../../../../../../plugins/kernel-locale/tuucho-kernel-locale-en/back/emailEn.js';
import { enGiftReceiver } from '../../../../../../../plugins/kernel-locale/tuucho-kernel-locale-en/back/giftReceiverEn.js';
import {
  enGiftSelectReminder,
  enGiftShareCard,
  enGiverPromise,
} from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift-locale-en/back/mailEn.js';
import { frEmail } from '../../../../../../../plugins/kernel-locale/tuucho-kernel-locale-fr/back/emailFr.js';
import { frGiftReceiver } from '../../../../../../../plugins/kernel-locale/tuucho-kernel-locale-fr/back/giftReceiverFr.js';

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

test('French locale packs expose the same email string keys as English', () => {
  const keysOf = (value: unknown, prefix = ''): string[] =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value).flatMap(([k, v]) => [`${prefix}${k}`, ...keysOf(v, `${prefix}${k}.`)])
      : [];
  assert.deepEqual(keysOf(frEmail).sort(), keysOf(enEmail).sort());
  assert.deepEqual(keysOf(frGiftReceiver).sort(), keysOf(enGiftReceiver).sort());
});

test('email string catalogues contain no em or en dash', () => {
  assertNoLongDash('enEmail', enEmail);
  assertNoLongDash('enGiftReceiver', enGiftReceiver);
  assertNoLongDash('enGiftShareCard', enGiftShareCard);
  assertNoLongDash('enGiftSelectReminder', enGiftSelectReminder);
  assertNoLongDash('enGiverPromise', enGiverPromise);
  assertNoLongDash('frEmail', frEmail);
  assertNoLongDash('frGiftReceiver', frGiftReceiver);
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
  'modules/shipping',
  'modules/orders/application/returns',
];

test('copy-building source code contains no em or en dash outside comments', () => {
  const offenders: string[] = [];
  for (const dir of COPY_SOURCE_DIRS) {
    const abs = join(SRC, dir);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs).filter((f) => f.endsWith('.ts'))) {
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
