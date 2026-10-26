/** Fine-grained personal access tokens. Classic tokens and SSH keys are refused. */
const FINE_GRAINED_TOKEN = /^github_pat_[A-Za-z0-9_]{20,500}$/;

export function parseGithubAccessToken(raw: string): string | null {
  const token = raw.trim();
  if (!FINE_GRAINED_TOKEN.test(token)) return null;
  return token;
}
