import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGithubAccessToken } from '../../../../../src/modules/plugins/domain/githubAccessToken.js';

const TOKEN = `github_pat_${'a'.repeat(22)}_${'b'.repeat(40)}`;

test('parseGithubAccessToken keeps a fine-grained token and drops anything else', () => {
  assert.equal(parseGithubAccessToken(`  ${TOKEN}\n`), TOKEN);
  assert.equal(parseGithubAccessToken('ghp_abcdefghijklmnopqrstuvwxyz123456'), null);
  assert.equal(parseGithubAccessToken('-----BEGIN OPENSSH PRIVATE KEY-----'), null);
  assert.equal(parseGithubAccessToken('https://github.com/acme/notes'), null);
  assert.equal(parseGithubAccessToken(''), null);
});
