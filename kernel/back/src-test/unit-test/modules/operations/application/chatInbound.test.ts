import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNewReplyText } from '../../../../../../../plugins/tuucho/messaging/contact/tuucho-contact/back/src/application/chatInbound.js';

test('only the new text above the quoted thread is kept', () => {
  const gmailFr = 'Bonjour,\nOui, c’est en stock.\n\nLe lun. 1 oct. 2026 à 10:00, Shop <chat@shop.example> a écrit :\n> Nouveau message';
  assert.equal(extractNewReplyText(gmailFr), 'Bonjour,\nOui, c’est en stock.');
  const gmailEn = 'Yes.\r\nOn Mon, Oct 1, 2026 at 10:00 AM Shop <chat@shop.example> wrote:\r\n> question';
  assert.equal(extractNewReplyText(gmailEn), 'Yes.');
});

test('Outlook separators, signatures and mobile footers end the reply', () => {
  assert.equal(extractNewReplyText('Merci\n-----Original Message-----\nFrom: x'), 'Merci');
  assert.equal(extractNewReplyText('Merci\n________________________________\nDe : x'), 'Merci');
  assert.equal(extractNewReplyText('Merci\n-- \nPam'), 'Merci');
  assert.equal(extractNewReplyText('Merci\n\nEnvoyé depuis mon iPhone'), 'Merci');
  assert.equal(extractNewReplyText('Thanks\nSent from my Galaxy'), 'Thanks');
});

test('a reply with no quote is kept whole and trimmed', () => {
  assert.equal(extractNewReplyText('\n  Line one\nLine two  \n\n'), 'Line one\nLine two');
});

test('a top-quoted message yields nothing', () => {
  assert.equal(extractNewReplyText('> quoted only\nreply below'), '');
});

test('a dash inside a sentence is not mistaken for a signature', () => {
  assert.equal(extractNewReplyText('Taille M -- ou L ?\nMerci'), 'Taille M -- ou L ?\nMerci');
});
