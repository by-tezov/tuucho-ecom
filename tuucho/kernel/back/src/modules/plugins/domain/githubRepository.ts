/** Official Tuucho origin. Hardcoded. Not a shop setting. */
export const OFFICIAL_ORIGIN = 'https://github.com/by-tezov/tuucho-ecom';
export const OFFICIAL_OWNER = 'by-tezov';
export const OFFICIAL_REPO = 'tuucho-ecom';

export type GithubRepoRef = {
  owner: string;
  repo: string;
  href: string;
};

const GITHUB_REPO = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i;

/** HTTPS GitHub repo root only. No git@, no GitLab, no extra path. */
export function parseGithubHttpsRepo(raw: string): GithubRepoRef | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('..')) return null;
  const match = trimmed.match(GITHUB_REPO);
  if (!match) return null;
  const owner = match[1]!;
  const repo = match[2]!;
  if (owner.toLowerCase() === '.' || repo.toLowerCase() === '.') return null;
  return {
    owner,
    repo,
    href: `https://github.com/${owner}/${repo}`,
  };
}

/** Lowercased HTTPS root. Token rows and update lookups share this key. */
export function githubRepositoryKey(ref: GithubRepoRef): string {
  return `https://github.com/${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`;
}

export function isOfficialGithubRepo(ref: GithubRepoRef): boolean {
  return ref.owner.toLowerCase() === OFFICIAL_OWNER && ref.repo.toLowerCase() === OFFICIAL_REPO;
}

export function githubApiTagsUrl(ref: GithubRepoRef): string {
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/tags?per_page=100`;
}

export function githubRawFileUrl(ref: GithubRepoRef, tag: string, path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(tag)}/${clean}`;
}

export function githubCodeloadTarGzUrl(ref: GithubRepoRef, tag: string): string {
  return `https://codeload.github.com/${ref.owner}/${ref.repo}/tar.gz/refs/tags/${encodeURIComponent(tag)}`;
}
