import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, type Language } from '../../../../../src/utils/language.js';
import {
  authOtpEmail,
  deletionReminderEmail,
  deletionRequestedEmail,
  emailChangeSecurityNoticeEmail,
  emailConfirmationEmail,
  invoiceEmail,
  orderReceivedEmail,
  passwordResetEmail,
  productRequestResponseEmail,
  superAdminSignInEmail,
  unconnectedContactReplyEmail,
} from '../../../../../src/modules/messaging/application/accountEmails.js';

const LONG_DASH = new RegExp('[\\u2013\\u2014]');

function allMails(language: Language) {
  return [
    unconnectedContactReplyEmail('Merci pour votre message.', language),
    passwordResetEmail('https://example.test/reset', language),
    authOtpEmail('123456', language),
    emailConfirmationEmail('https://example.test/confirm', language),
    emailChangeSecurityNoticeEmail('new@example.test', 'https://example.test/lock', language),
    deletionRequestedEmail('2026-11-05', language),
    deletionReminderEmail(7, '2026-11-05', language),
    invoiceEmail('PS-0001', language),
    invoiceEmail('PS-0001', language, true, 'https://example.test/manage'),
    orderReceivedEmail('PS-0001', language),
    superAdminSignInEmail({
      kind: 'signin',
      at: new Date('2026-10-07T12:00:00Z'),
      ip: '203.0.113.7',
      location: null,
      device: 'Chrome · Linux',
      lockUrl: 'https://example.test/lock',
      language,
    }),
    productRequestResponseEmail({
      publicId: 'ABCD1234',
      token: 'token',
      title: 'Floral blush',
      size: 'M',
      quantity: 1,
      price: 28,
      message: 'OK',
      accepted: true,
      language,
    }),
  ];
}

test('every account email renders in every language, as a document in that language', () => {
  for (const language of LANGUAGES) {
    for (const mail of allMails(language)) {
      assert.ok(mail.subject, `${language}: empty subject`);
      assert.ok(
        mail.html.startsWith(`<!DOCTYPE html>\n<html lang="${language}">`),
        `${language}: ${mail.subject}`,
      );
      assert.equal(mail.html.includes('[object Object]'), false, `${language}: ${mail.subject}`);
      assert.equal(LONG_DASH.test(`${mail.subject}${mail.text}`), false, `${language}: long dash`);
    }
  }
});

test('an English account email carries no French', () => {
  const french = /Votre|votre|Bonjour|Réinitialis|Confirmez|Suppression|Visiter|automatiquement|Fait main/;
  for (const mail of allMails('en').slice(1)) {
    assert.doesNotMatch(`${mail.subject}\n${mail.text}\n${mail.html}`, french, mail.subject);
  }
});

test('outside French, the invoice email says the invoice itself is French', () => {
  assert.match(invoiceEmail('PS-0001', 'en').text, /issued in French/);
  assert.doesNotMatch(invoiceEmail('PS-0001', 'fr').text, /français/);
});

test('deletion dates are written the reader’s way', () => {
  assert.match(deletionRequestedEmail('2026-11-05', 'fr').text, /5 novembre 2026/);
  assert.match(deletionRequestedEmail('2026-11-05', 'en').text, /5 November 2026/);
});

test('the super-admin sign-in alert lists what is known, the unknown, and the lock link', () => {
  const base = {
    at: new Date('2026-10-07T12:00:00Z'),
    ip: '203.0.113.7',
    location: null,
    device: 'Chrome · Linux',
    lockUrl: 'https://example.test/lock?token=abc',
    language: 'fr' as const,
  };
  const signin = superAdminSignInEmail({ ...base, kind: 'signin' });
  assert.match(signin.text, /Adresse IP : 203\.0\.113\.7/);
  assert.match(signin.text, /Lieu : inconnu/);
  assert.match(signin.text, /Appareil : Chrome · Linux/);
  assert.match(signin.text, /7 octobre 2026 à 14:00/);
  assert.match(signin.text, /https:\/\/example\.test\/lock\?token=abc/);
  assert.match(signin.html, /https:\/\/example\.test\/lock\?token/);
  const resume = superAdminSignInEmail({ ...base, kind: 'resume' });
  assert.notEqual(signin.text.split('\n')[2], resume.text.split('\n')[2]);
});
