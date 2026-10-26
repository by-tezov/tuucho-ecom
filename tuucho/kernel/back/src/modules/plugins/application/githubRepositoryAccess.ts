import { pool } from '../../../db/pool.js';
import type { Rows } from '../../../db/rows.js';
import { decryptPii, encryptPii } from '../../../platform/security/piiCrypto.js';
import { parseGithubAccessToken } from '../domain/githubAccessToken.js';
import { githubRepositoryKey, parseGithubHttpsRepo, type GithubRepoRef } from '../domain/githubRepository.js';
import { createGithubClient, type GithubClient } from './updates/githubClient.js';

const MAX_ROWS = 40;

export class GithubAccessError extends Error {
  readonly code: 'invalid_repository' | 'invalid_token' | 'too_many';

  constructor(code: GithubAccessError['code']) {
    super(code);
    this.name = 'GithubAccessError';
    this.code = code;
  }
}

export type GithubAccessEntry = {
  repository: string;
  updatedAt: string;
};

type AccessRow = Pick<Rows['github_repository_access'], 'repository' | 'updated_at' | 'token_enc'>;

function entryOf(row: Pick<AccessRow, 'repository' | 'updated_at'>): GithubAccessEntry {
  return { repository: row.repository, updatedAt: row.updated_at };
}

export async function listGithubRepositoryAccess(): Promise<GithubAccessEntry[]> {
  const { rows } = await pool.query<Pick<AccessRow, 'repository' | 'updated_at'>>(
    `select repository, updated_at
     from github_repository_access
     order by repository`,
  );
  return rows.map(entryOf);
}

export async function saveGithubRepositoryAccess(input: {
  repository: string;
  token: string;
  updatedBy: string | null;
}): Promise<GithubAccessEntry> {
  const ref = parseGithubHttpsRepo(input.repository);
  if (!ref) throw new GithubAccessError('invalid_repository');
  const token = parseGithubAccessToken(input.token);
  if (!token) throw new GithubAccessError('invalid_token');
  const repository = githubRepositoryKey(ref);
  const sealed = encryptPii(token);
  if (!sealed) throw new GithubAccessError('invalid_token');

  const existing = await pool.query<Pick<AccessRow, 'repository'>>(
    `select repository from github_repository_access where repository = $1`,
    [repository],
  );
  if (existing.rows.length === 0) {
    const counted = await pool.query<{ total: number }>(
      `select count(*)::int as total from github_repository_access`,
    );
    if ((counted.rows[0]?.total ?? 0) >= MAX_ROWS) throw new GithubAccessError('too_many');
  }

  const { rows } = await pool.query<Pick<AccessRow, 'repository' | 'updated_at'>>(
    `insert into github_repository_access (repository, token_enc, updated_at, updated_by)
     values ($1, $2, now(), $3)
     on conflict (repository) do update
       set token_enc = excluded.token_enc,
           updated_at = now(),
           updated_by = excluded.updated_by
     returning repository, updated_at`,
    [repository, sealed, input.updatedBy],
  );
  const saved = rows[0];
  if (!saved) throw new GithubAccessError('invalid_repository');
  return entryOf(saved);
}

export async function deleteGithubRepositoryAccess(repository: string): Promise<boolean> {
  const ref = parseGithubHttpsRepo(repository);
  if (!ref) throw new GithubAccessError('invalid_repository');
  const { rowCount } = await pool.query(`delete from github_repository_access where repository = $1`, [
    githubRepositoryKey(ref),
  ]);
  return (rowCount ?? 0) > 0;
}

export async function githubAccessTokenFor(ref: GithubRepoRef): Promise<string | null> {
  const repository = githubRepositoryKey(ref);
  const { rows } = await pool.query<Pick<AccessRow, 'token_enc'>>(
    `select token_enc from github_repository_access where repository = $1`,
    [repository],
  );
  const stored = rows[0]?.token_enc;
  if (!stored) return null;
  let plain: string | null;
  try {
    plain = decryptPii(stored);
  } catch {
    throw new Error(
      `The saved GitHub access token for ${repository} could not be read. Save it again on the Core page.`,
    );
  }
  const token = plain ? parseGithubAccessToken(plain) : null;
  if (!token) {
    throw new Error(
      `The saved GitHub access token for ${repository} cannot be used. Save it again on the Core page.`,
    );
  }
  return token;
}

/** One client per check or apply. Tokens are read once per repository. */
export function createUpdatingGithubClient(): GithubClient {
  const cache = new Map<string, Promise<string | null>>();
  return createGithubClient({
    resolveToken(ref) {
      const key = githubRepositoryKey(ref);
      const hit = cache.get(key);
      if (hit) return hit;
      const pending = githubAccessTokenFor(ref);
      cache.set(key, pending);
      return pending;
    },
  });
}
