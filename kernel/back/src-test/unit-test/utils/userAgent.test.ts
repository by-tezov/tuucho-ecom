import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeUserAgent } from '../../../src/utils/userAgent.js';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

test('user agents summarize to browser and OS', () => {
  assert.equal(summarizeUserAgent(CHROME_WINDOWS), 'Chrome · Windows');
  assert.equal(summarizeUserAgent(`${CHROME_WINDOWS} Edg/129.0`), 'Edge · Windows');
  assert.equal(summarizeUserAgent(`${CHROME_WINDOWS} OPR/114.0`), 'Opera · Windows');
  assert.equal(summarizeUserAgent(CHROME_ANDROID), 'Chrome · Android');
  assert.equal(
    summarizeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'),
    'Firefox · Linux',
  );
});

test('unknown agents give null, never the raw string', () => {
  assert.equal(summarizeUserAgent('curl/8.0'), null);
  assert.equal(summarizeUserAgent(''), null);
  assert.equal(summarizeUserAgent(null), null);
});

test('an iPhone is reported as iOS despite its "like Mac OS X" token', () => {
  assert.equal(summarizeUserAgent(SAFARI_IPHONE), 'Safari · iOS');
  assert.equal(
    summarizeUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    ),
    'Safari · macOS',
  );
});
