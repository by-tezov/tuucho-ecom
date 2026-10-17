/**
 * Renders every email template, from disk, with its partials.
 *
 * These are the only assets resolved by climbing out of this file's own
 * directory, so moving the file silently breaks them: nothing fails until an
 * email is actually sent, which in practice means a customer's order
 * confirmation. This test makes that a `npm run test:unit` failure instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  genericNoticeHtml,
  renderEmailTemplate,
} from '../../../../../src/modules/messaging/application/emailTemplates.js';

const templatesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'src',
  'templates',
  'emails',
);

/** Every top-level template that ships, discovered rather than listed, so a
 * new one is covered the moment it is added. */
const templateNames = readdirSync(templatesDir)
  .filter((entry) => entry.endsWith('.hbs'))
  .map((entry) => entry.replace(/\.hbs$/, ''));

test('the templates directory resolves from this module', () => {
  assert.ok(templateNames.length > 0, `no .hbs templates found under ${templatesDir}`);
});

test('every template renders with its partials registered', () => {
  for (const name of templateNames) {
    const html = renderEmailTemplate(name, 'fr', {
      title: 'Test',
      lines: ['line'],
      items: [],
      order: { number: 'PS-0001', items: [] },
      total: 0,
    });
    assert.equal(typeof html, 'string', `${name} did not render a string`);
    assert.ok(html.length > 0, `${name} rendered empty`);
    assert.equal(html.includes('[object Object]'), false, `${name} stringified an object`);
  }
});

test('every email is a whole document in the language it is written in', () => {
  const html = renderEmailTemplate('genericNotice', 'en', { title: 'Test', paragraphs: ['Hello'] });
  assert.ok(html.startsWith('<!DOCTYPE html>\n<html lang="en">'), 'missing the <html lang> document');
  assert.ok(html.trimEnd().endsWith('</html>'), 'document is not closed');
});

test('a translated notice carries no French: footer and tagline follow its language', () => {
  const html = genericNoticeHtml({ language: 'en', title: 'Test', paragraphs: ['Hello'] });
  assert.match(html, /Handmade with care/);
  assert.match(html, /This is an automated message from Shop/);
  assert.doesNotMatch(html, /Fait main|automatiquement/);
});

test('a non-string footer fails rather than rendering [object Object]', () => {
  assert.throws(() =>
    renderEmailTemplate('giftNotice', 'fr', {
      title: 'Test',
      footer: { brand: 'Shop', tagline: 'x' },
    }),
  );
});

test('an unknown template name fails loudly rather than rendering blank', () => {
  assert.throws(() => renderEmailTemplate('definitelyNotATemplate', 'fr', {}));
});
