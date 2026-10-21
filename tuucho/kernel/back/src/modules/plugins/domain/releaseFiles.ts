/** Committed Check/Apply tag catalog inside tuucho/. Generated from shop-root package.json. */
export const TUCHO_VERSIONING_CATALOG = 'tuucho/tuucho-versioning.json';
/** Last successful Apply or setup stamp at shop root. Gitignored. Not Plugins Core. */
export const TUCHO_VERSIONING_LOCK = 'tuucho-versioning.lock.json';

/** Historical GitHub tags. Check/Apply fall back in this order after the catalog. */
export const LEGACY_RELEASE_CATALOGS = ['tuucho-release.json', 'release.json'] as const;
export const LEGACY_SHOP_RELEASES = ['tuucho-shop-release.json', 'shop-release.json'] as const;

export const TUCHO_VERSIONING_CATALOG_COMMENT =
  'Check/Apply tag catalog generated from shop-root package.json (the only product version). Not Plugins Core or Check current. Historical GitHub tags may still use tuucho-release.json or release.json. Generate before tagging: node scripts/tuucho-versioning.mjs';

export const TUCHO_VERSIONING_LOCK_COMMENT =
  'Last successful Apply or setup stamp, plus tuucho/ hashes used to refuse a dirty Apply. Gitignored shop-instance state, not library source. Plugins Core and Check current still read shop-root package.json.';

export async function readReleaseCatalogJson(opts: {
  readOptionalJson: (path: string) => Promise<unknown | null>;
  readJson: (path: string) => Promise<unknown>;
}): Promise<unknown> {
  const preferred = await opts.readOptionalJson(TUCHO_VERSIONING_CATALOG);
  if (preferred != null) return preferred;
  for (const name of LEGACY_RELEASE_CATALOGS.slice(0, -1)) {
    const found = await opts.readOptionalJson(name);
    if (found != null) return found;
  }
  return opts.readJson(LEGACY_RELEASE_CATALOGS[LEGACY_RELEASE_CATALOGS.length - 1]);
}
