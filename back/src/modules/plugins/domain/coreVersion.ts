/** Kernel semver. Keep in lockstep with `back/package.json` `version`.
 * Plugins declare `engines.core` against this value. */
export const CORE_VERSION = '1.0.9';

/** Default range shipped plugins declare. Covers this 1.x kernel. */
export const DEFAULT_CORE_ENGINE = '>=1.0.0 <2.0.0';
