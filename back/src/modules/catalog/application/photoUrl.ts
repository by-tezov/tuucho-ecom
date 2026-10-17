/** Absolute URL for a photo stored as a media-relative path. Its own module
 * so productVariants.ts can use it without importing products.ts, which
 * imports productVariants.ts. Re-exported from products.ts, which is where
 * every existing caller expects it. */
export function toPhotoUrl(publicMediaUrl: string, relativePath: string): string {
  return `${publicMediaUrl}/${relativePath.replace(/^\/+/, '')}`;
}
