/** Running kernel semver. Check / Apply use this plus `shop-release.json`,
 * never a shop `package.json`. Official-repo CI keeps it in lockstep with
 * `kernel/back/package.json`, `kernel/front/package.json`, and `release.json`.
 * Plugins declare `engines.core` against this value. */
export const CORE_VERSION = '1.0.9';

/** Default range shipped plugins declare. Covers this 1.x kernel. */
export const DEFAULT_CORE_ENGINE = '>=1.0.0 <2.0.0';
