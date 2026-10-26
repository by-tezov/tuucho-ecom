import { CORE_VERSION } from '../../../../config/appVersion.js';
import {
  githubApiTagsUrl,
  githubCodeloadTarGzUrl,
  githubRawFileUrl,
  type GithubRepoRef,
} from '../../domain/githubRepository.js';
import { parseReleaseTag, sortReleaseTags, type ReleaseTag } from '../../domain/semverTags.js';

export type GithubHttp = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

const DEFAULT_TIMEOUT_MS = 20_000;
const ARCHIVE_TIMEOUT_MS = 120_000;

function defaultHttp(timeoutMs: number): GithubHttp {
  return async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `tuucho-ecom/${CORE_VERSION}`,
          ...init?.headers,
        },
      });
      return {
        ok: response.ok,
        status: response.status,
        text: () => response.text(),
        arrayBuffer: () => response.arrayBuffer(),
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

export type GithubTokenResolver = (ref: GithubRepoRef) => Promise<string | null> | string | null;

export type GithubClient = {
  listReleaseTags: (ref: GithubRepoRef) => Promise<ReleaseTag[]>;
  readJson: (ref: GithubRepoRef, tag: string, path: string) => Promise<unknown>;
  readOptionalJson: (ref: GithubRepoRef, tag: string, path: string) => Promise<unknown | null>;
  readOptionalText: (ref: GithubRepoRef, tag: string, path: string) => Promise<string | null>;
  downloadTagArchive: (ref: GithubRepoRef, tag: string) => Promise<Uint8Array>;
};

function missingRepository(ref: GithubRepoRef, authed: boolean): string {
  return authed
    ? `GitHub repository ${ref.href} was not found with the saved access token.`
    : `GitHub repository ${ref.href} was not found. If it is private, save an access token for it on the Core page.`;
}

function refused(ref: GithubRepoRef, status: number, authed: boolean, what: string): string {
  return authed
    ? `GitHub refused the saved access token for ${ref.href} (${status}).`
    : `GitHub ${what} failed (${status}) for ${ref.href}.`;
}

export function createGithubClient(
  options: {
    http?: GithubHttp;
    archiveHttp?: GithubHttp;
    resolveToken?: GithubTokenResolver;
  } = {},
): GithubClient {
  const http = options.http ?? defaultHttp(DEFAULT_TIMEOUT_MS);
  const archiveHttp = options.archiveHttp ?? (options.http ? options.http : defaultHttp(ARCHIVE_TIMEOUT_MS));
  const resolveToken = options.resolveToken;

  async function authorization(
    ref: GithubRepoRef,
  ): Promise<{ headers: Record<string, string>; authed: boolean }> {
    const token = resolveToken ? ((await resolveToken(ref))?.trim() ?? '') : '';
    if (!token) return { headers: {}, authed: false };
    return { headers: { Authorization: `Bearer ${token}` }, authed: true };
  }

  return {
    async listReleaseTags(ref) {
      const tags: ReleaseTag[] = [];
      const auth = await authorization(ref);
      let url: string | null = githubApiTagsUrl(ref);
      let page = 0;
      while (url && page < 10) {
        page += 1;
        const response = await http(url, { headers: auth.headers });
        if (response.status === 404) throw new Error(missingRepository(ref, auth.authed));
        if (response.status === 401 || response.status === 403) {
          throw new Error(refused(ref, response.status, auth.authed, 'tags request'));
        }
        if (!response.ok) throw new Error(`GitHub tags request failed (${response.status}) for ${ref.href}.`);
        const body = JSON.parse(await response.text()) as unknown;
        if (!Array.isArray(body)) throw new Error('GitHub tags response was not a list.');
        for (const row of body) {
          const name = row && typeof row === 'object' ? (row as { name?: unknown }).name : undefined;
          if (typeof name !== 'string') continue;
          const parsed = parseReleaseTag(name);
          if (parsed) tags.push(parsed);
        }
        url = null;
      }
      return sortReleaseTags(tags);
    },

    async readJson(ref, tag, path) {
      const found = await this.readOptionalJson(ref, tag, path);
      if (found === null) throw new Error(`Missing ${path} on ${ref.href} tag ${tag}.`);
      return found;
    },

    async readOptionalText(ref, tag, path) {
      const auth = await authorization(ref);
      const response = await http(githubRawFileUrl(ref, tag, path), { headers: auth.headers });
      if (response.status === 404) return null;
      if (response.status === 401 || response.status === 403) {
        throw new Error(refused(ref, response.status, auth.authed, 'file request'));
      }
      if (!response.ok) {
        throw new Error(`GitHub file ${path} on ${tag} failed (${response.status}).`);
      }
      return response.text();
    },

    async readOptionalJson(ref, tag, path) {
      const text = await this.readOptionalText(ref, tag, path);
      if (text === null) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new Error(`${path} on ${tag} is not valid JSON.`);
      }
    },

    async downloadTagArchive(ref, tag) {
      const auth = await authorization(ref);
      const response = await archiveHttp(githubCodeloadTarGzUrl(ref, tag), { headers: auth.headers });
      if (response.status === 404) {
        throw new Error(
          auth.authed
            ? `GitHub archive for ${ref.href} tag ${tag} was not found with the saved access token.`
            : `GitHub archive for ${ref.href} tag ${tag} was not found.`,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(refused(ref, response.status, auth.authed, 'archive download'));
      }
      if (!response.ok) {
        throw new Error(`GitHub archive download failed (${response.status}) for ${tag}.`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
