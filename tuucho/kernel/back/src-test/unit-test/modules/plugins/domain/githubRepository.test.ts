import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_ORIGIN,
  githubCodeloadTarGzUrl,
  githubRawFileUrl,
  isOfficialGithubRepo,
  parseGithubHttpsRepo,
} from '../../../../../src/modules/plugins/domain/githubRepository.js';

test('parseGithubHttpsRepo accepts HTTPS repo roots only', () => {
  const parsed = parseGithubHttpsRepo('https://github.com/acme/gift-wrap.git');
  assert.deepEqual(parsed, {
    owner: 'acme',
    repo: 'gift-wrap',
    href: 'https://github.com/acme/gift-wrap',
  });
  assert.equal(parseGithubHttpsRepo('git@github.com:acme/gift-wrap.git'), null);
  assert.equal(parseGithubHttpsRepo('https://gitlab.com/acme/gift-wrap'), null);
  assert.equal(parseGithubHttpsRepo('https://github.com/acme/gift-wrap/tree/main'), null);
  assert.ok(isOfficialGithubRepo(parseGithubHttpsRepo(OFFICIAL_ORIGIN)!));
});

test('Check URLs use tag 1.0.9 with no v prefix', () => {
  const ref = parseGithubHttpsRepo(OFFICIAL_ORIGIN)!;
  assert.equal(
    githubRawFileUrl(ref, '1.0.9', 'release.json'),
    'https://raw.githubusercontent.com/by-tezov/tuucho-ecom/1.0.9/release.json',
  );
  assert.equal(
    githubCodeloadTarGzUrl(ref, '1.0.9'),
    'https://codeload.github.com/by-tezov/tuucho-ecom/tar.gz/refs/tags/1.0.9',
  );
});
