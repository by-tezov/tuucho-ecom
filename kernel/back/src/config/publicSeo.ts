/**
 * Public indexing is on only when APP_TARGET is exactly `prod`.
 * `dev` and `preprod` must not look like production to crawlers.
 * NODE_ENV is unrelated (cPanel Application Mode) and must not flip this.
 */
export function isPublicSeoTarget(target: string): boolean {
  return target === 'prod';
}

export const PUBLIC_SEO_ROBOTS = 'index, follow';
export const PRIVATE_SEO_ROBOTS = 'noindex, nofollow';
export const PRIVATE_SEO_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';
