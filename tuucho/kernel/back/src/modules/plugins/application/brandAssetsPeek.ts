/** Last `brandAssets` map seen on a full storefront bootstrap build.
 * Lets SEO / OG defaults prefer a plugin override without rebuilding the
 * whole bootstrap payload on every crawler hit. */

let peeked: Record<string, string> = {};

export function rememberBrandAssets(assets: Record<string, string> | undefined): void {
  peeked = assets && typeof assets === 'object' ? { ...assets } : {};
}

export function peekBrandAsset(key: string, fallback: string): string {
  const override = peeked[key];
  return typeof override === 'string' && override.trim() ? override.trim() : fallback;
}
