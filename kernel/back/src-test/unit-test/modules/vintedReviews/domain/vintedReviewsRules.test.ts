import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTranslations,
  myMemoryCode,
  splitForTranslation,
  storefrontLang,
  isAutomaticFeedback,
  nextFeaturedIds,
  parseMemberLocation,
  parseScrapeCount,
  parseShopRating,
  parseVintedProfileUrl,
  toRealFeedback,
} from '../../../../../../../plugins/tuucho/commerce/vinted-review/tuucho-commerce-vinted-review/back/src/domain/vintedReviewsRules.js';

const real = {
  id: 4452366795,
  feedback: '  Parfait merci beaucoup !  ',
  rating: 5,
  system_feedback: false,
  created_at_ts: '2026-09-25T15:28:17+02:00',
  user: { id: 146700350, login: 'nsk_d3sign' },
};

test('profile URL: only a Vinted member URL is accepted', () => {
  assert.deepEqual(parseVintedProfileUrl('https://www.vinted.fr/member/254890649'), {
    origin: 'https://www.vinted.fr',
    memberId: '254890649',
  });
  assert.equal(
    parseVintedProfileUrl('https://www.vinted.fr/member/254890649-tuucho?tab=feedback')?.memberId,
    '254890649',
  );
  assert.equal(
    parseVintedProfileUrl('https://www.vinted.co.uk/member/1/')?.origin,
    'https://www.vinted.co.uk',
  );
  for (const bad of [
    'http://www.vinted.fr/member/1',
    'https://vinted.fr.evil.com/member/1',
    'https://www.vinted.fr:8443/member/1',
    'https://user@www.vinted.fr/member/1',
    'https://www.vinted.fr/items/1',
    'https://www.vinted.fr/member/abc',
    'not a url',
    42,
  ]) {
    assert.equal(parseVintedProfileUrl(bad), null, String(bad));
  }
});

test('scrape count: default, bounds and integers only', () => {
  assert.equal(parseScrapeCount(undefined), 5);
  assert.equal(parseScrapeCount(1), 1);
  assert.equal(parseScrapeCount(30), 30);
  assert.equal(parseScrapeCount(0), null);
  assert.equal(parseScrapeCount(31), null);
  assert.equal(parseScrapeCount(2.5), null);
  assert.equal(parseScrapeCount('5'), null);
});

test('automatic feedback is discarded by flag or by its text', () => {
  assert.equal(isAutomaticFeedback({ ...real, system_feedback: true }), true);
  assert.equal(
    isAutomaticFeedback({ ...real, feedback: 'Évaluation automatique : vente réalisée avec succès' }),
    true,
  );
  assert.equal(
    isAutomaticFeedback({ ...real, feedback: 'Auto-feedback: Sale completed successfully' }),
    true,
  );
  assert.equal(toRealFeedback({ ...real, system_feedback: true }), null);
});

test('a buyer review is normalised', () => {
  assert.deepEqual(toRealFeedback(real), {
    feedbackId: '4452366795',
    text: 'Parfait merci beaucoup !',
    rating: 5,
    reviewedAt: '2026-09-25T13:28:17.000Z',
    authorVintedId: '146700350',
    authorLogin: 'nsk_d3sign',
  });
  assert.equal(toRealFeedback({ ...real, feedback: '   ' }), null);
  assert.equal(toRealFeedback({ ...real, rating: 0 }), null);
  assert.equal(toRealFeedback({ ...real, user: null }), null);
  assert.equal(toRealFeedback({ ...real, created_at_ts: 'nope' }), null);
});

function memberHtml(id: string, expose: boolean, city: string): string {
  return `noise \\"id\\":999,\\"city\\":\\"Paris\\" more \\"id\\":${id},\\"login\\":\\"x\\",\\"expose_location\\":${expose},\\"city\\":\\"${city}\\",\\"city_id\\":15274,\\"country_code\\":\\"FR\\",`;
}

test('member location: read after the member id, a hidden city keeps the country', () => {
  assert.deepEqual(parseMemberLocation(memberHtml('146700350', true, 'Châteaubriant'), '146700350'), {
    city: 'Châteaubriant',
    countryCode: 'FR',
  });
  assert.deepEqual(parseMemberLocation(memberHtml('146700350', false, 'Châteaubriant'), '146700350'), {
    city: null,
    countryCode: 'FR',
  });
  assert.deepEqual(parseMemberLocation(memberHtml('146700350', true, ''), '146700350'), {
    city: null,
    countryCode: 'FR',
  });
  assert.deepEqual(parseMemberLocation(memberHtml('146700350', true, 'Lyon'), '1'), {
    city: null,
    countryCode: null,
  });
});

test('featured set: selection first, oldest dropped, three at most', () => {
  assert.deepEqual(nextFeaturedIds(['a', 'b', 'c'], ['d']), ['d', 'a', 'b']);
  assert.deepEqual(nextFeaturedIds(['a', 'b', 'c'], ['d', 'e', 'f']), ['d', 'e', 'f']);
  assert.deepEqual(nextFeaturedIds(['a'], ['d', 'd']), ['d', 'a']);
  assert.deepEqual(nextFeaturedIds([], ['d', 'e']), ['d', 'e']);
});

test('shop rating: Vinted reputation (0 to 1) to stars with one decimal', () => {
  const page = (reputation: string, count: string) =>
    `\\"id\\":1,\\"feedback_reputation\\":0.1 \\"id\\":254890649,\\"login\\":\\"tuucho\\",\\"feedback_reputation\\":${reputation},\\"feedback_count\\":${count},`;
  assert.deepEqual(parseShopRating(page('1', '107'), '254890649'), { rating: '5.0', reviewCount: 107 });
  assert.deepEqual(parseShopRating(page('0.98', '50'), '254890649'), { rating: '4.9', reviewCount: 50 });
  assert.equal(parseShopRating(page('1.5', '3'), '254890649'), null);
  assert.equal(parseShopRating(page('1', '107'), '999'), null);
});

test('site languages map to MyMemory codes and storefronts to a source language', () => {
  assert.equal(myMemoryCode('en'), 'en-GB');
  assert.equal(myMemoryCode('fr'), 'fr');
  assert.equal(storefrontLang('https://www.vinted.fr'), 'fr');
  assert.equal(storefrontLang('https://www.vinted.co.uk'), 'en');
  assert.equal(storefrontLang('https://www.vinted.de'), null);
});

test('long text is cut into pieces under the byte limit, sentences first', () => {
  assert.deepEqual(splitForTranslation('Parfait merci !'), ['Parfait merci !']);
  const long = 'Très belle pose. '.repeat(40).trim();
  const pieces = splitForTranslation(long, 120);
  assert.ok(pieces.length > 1);
  for (const piece of pieces) assert.ok(new TextEncoder().encode(piece).length <= 120);
  assert.equal(pieces.join(' '), long);
  const word = 'é'.repeat(100);
  assert.ok(splitForTranslation(word, 50).every((piece) => new TextEncoder().encode(piece).length <= 50));
});

test('stored translations keep only non-empty site languages', () => {
  assert.deepEqual(cleanTranslations({ en: ' Perfect ', de: 'Perfekt', es: '', it: 3 }), { en: 'Perfect' });
  assert.deepEqual(cleanTranslations(null), {});
});
