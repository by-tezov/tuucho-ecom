import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGithubHttpsRepo } from '../../../../../../src/modules/plugins/domain/githubRepository.js';
import {
  createGithubClient,
  type GithubHttp,
} from '../../../../../../src/modules/plugins/application/updates/githubClient.js';

const TOKEN = `github_pat_${'a'.repeat(22)}_${'b'.repeat(40)}`;

function httpRecording(statusFor: (url: string) => number): {
  http: GithubHttp;
  calls: Array<{ url: string; authorization?: string }>;
} {
  const calls: Array<{ url: string; authorization?: string }> = [];
  const http: GithubHttp = async (url, init) => {
    calls.push({ url, authorization: init?.headers?.Authorization });
    const status = statusFor(url);
    const body = status === 200 && url.includes('/tags') ? JSON.stringify([{ name: '1.0.0' }]) : 'ok';
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  return { http, calls };
}

test('a saved token is sent only for that repository', async () => {
  const { http, calls } = httpRecording(() => 200);
  const client = createGithubClient({
    http,
    archiveHttp: http,
    resolveToken: (ref) => (ref.repo === 'private-notes' ? TOKEN : null),
  });
  const privateRef = parseGithubHttpsRepo('https://github.com/acme/private-notes')!;
  const publicRef = parseGithubHttpsRepo('https://github.com/acme/public-notes')!;
  await client.listReleaseTags(privateRef);
  await client.readOptionalText(publicRef, '1.0.0', 'README.md');
  await client.downloadTagArchive(privateRef, '1.0.0');
  assert.equal(calls[0]?.authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[1]?.authorization, undefined);
  assert.equal(calls[2]?.authorization, `Bearer ${TOKEN}`);
});

test('a missing private repository names the Core page when no token is saved', async () => {
  const { http } = httpRecording(() => 404);
  const client = createGithubClient({ http, resolveToken: () => null });
  await assert.rejects(
    () => client.listReleaseTags(parseGithubHttpsRepo('https://github.com/acme/hidden')!),
    /save an access token for it on the Core page/,
  );
});

test('a saved token that cannot see the repository is reported as such', async () => {
  const { http } = httpRecording(() => 404);
  const client = createGithubClient({ http, resolveToken: () => TOKEN });
  await assert.rejects(
    () => client.listReleaseTags(parseGithubHttpsRepo('https://github.com/acme/hidden')!),
    /saved access token/,
  );
});
