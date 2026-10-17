/**
 * Everything boot.ts needs from the application, behind one import.
 *
 * The deployed build bundles this file and its whole dependency graph into a
 * single `bundle/serverEntry.js` (scripts/build.mjs). On the LWS host a cold
 * start was dominated by reading ~1,200 small JS files off the shared
 * filesystem, one per module; one file removes almost all of that. boot.ts
 * takes its readiness probes from here too, so they share the bundle's own
 * pool and config instead of loading a second, unbundled copy.
 */
export { startServer } from './app.js';
export { pool } from './db/pool.js';
export { config } from './config/env.js';
export { getStripe, retrieveBalance } from './platform/stripe/stripeClient.js';
export { warmAppPreferences } from './modules/settings/application/appPreferences.js';
