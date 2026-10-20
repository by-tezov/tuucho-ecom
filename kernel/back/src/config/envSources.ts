/**
 * Where configuration comes from, before anything is validated.
 *
 * Load order for APP_TARGET=<env>:
 * `config/config.json` → `config/<env>/config.json` → common private (or
 * example) → env private (or example) → leftover process env (`APP_TARGET`,
 * optional `PORT` / `DATABASE_URL`).
 */
import { applicationRoot } from './applicationRoot.js';
import { applyJsonConfig, listEnvironments, type AppTarget } from './loadJsonConfig.js';

export type { AppTarget };

const targetFileSuffix = applyJsonConfig(applicationRoot);

export { targetFileSuffix, listEnvironments };
