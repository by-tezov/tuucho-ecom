import { CORE_VERSION } from '../../../../config/appVersion.js';
import {
  githubApiTagsUrl,
  githubCodeloadTarGzUrl,
  githubRawFileUrl,
  type GithubRepoRef,
} from '../../domain/githubRepository.js';
import { parseReleaseTag, sortReleaseTags, type ReleaseTag } from '../../domain/semverTags.js';

export type GithubHttp = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
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

export type GithubClient = {
  listReleaseTags: (ref: GithubRepoRef) => Promise<ReleaseTag[]>;
  readJson: (ref: GithubRepoRef, tag: string, path: string) => Promise<unknown>;
  readOptionalJson: (ref: GithubRepoRef, tag: string, path: string) => Promise<unknown | null>;
  readOptionalText: (ref: GithubRepoRef, tag: string, path: string) => Promise<string | null>;
  downloadTagArchive: (ref: GithubRepoRef, tag: string) => Promise<Uint8Array>;
};

export function createGithubClient(http: GithubHttp = defaultHttp(DEFAULT_TIMEOUT_MS)): GithubClient {
  const archiveHttp = defaultHttp(ARCHIVE_TIMEOUT_MS);

  return {
    async listReleaseTags(ref) {
      const tags: ReleaseTag[] = [];
      let url: string | null = githubApiTagsUrl(ref);
      let page = 0;
      while (url && page < 10) {
        page += 1;
        const response = await http(url);
        if (response.status === 404) {
          throw new Error(`GitHub repository ${ref.href} was not found (private repos need a token, which v1 does not send).`);
        }
        if (!response.ok) {
          throw new Error(`GitHub tags request failed (${response.status}) for ${ref.href}.`);
        }
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
      const response = await http(githubRawFileUrl(ref, tag, path));
      if (response.status === 404) return null;
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
      const response = await archiveHttp(githubCodeloadTarGzUrl(ref, tag));
      if (response.status === 404) {
        throw new Error(`GitHub archive for ${ref.href} tag ${tag} was not found.`);
      }
      if (!response.ok) {
        throw new Error(`GitHub archive download failed (${response.status}) for ${tag}.`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
