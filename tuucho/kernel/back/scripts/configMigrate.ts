import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findPackRoot } from '../src/config/shopPaths.js';
import { inspectConfig } from '../src/config/loadJsonConfig.js';
import { runConfigMigrate } from '../src/config/configMigrate.js';

const dryRun = process.argv.includes('--dry-run');
const strict = process.argv.includes('--strict');
const packRoot = findPackRoot(process.cwd());
const result = await runConfigMigrate({ packRoot, dryRun, strict });
for (const line of result.logs) console.log(`[config:migrate] ${line}`);
for (const line of result.warnings) console.warn(`[config:migrate] warning: ${line}`);
for (const line of result.errors) console.error(`[config:migrate] error: ${line}`);
if (result.pending.length > 0) {
  console.log(`[config:migrate] pending: ${result.pending.join(', ') || '(none)'}`);
}
if (result.copied) console.log('[config:migrate] first-install copy from tuucho/factory-backup/config/');
if (result.copiedPlugins) console.log('[config:migrate] first-install copy from tuucho/factory-backup/plugins/');
if (dryRun) console.log('[config:migrate] dry-run (no writes)');

const shopConfig = join(packRoot, 'tuucho-config');
if (!dryRun && existsSync(shopConfig)) {
  const status = inspectConfig(shopConfig);
  if (!status.ok) {
    for (const error of status.errors) console.error(`[config:migrate] ${error}`);
    process.exit(1);
  }
}
if (strict && result.warnings.length > 0) process.exit(1);
if (result.errors.length > 0) process.exit(1);
