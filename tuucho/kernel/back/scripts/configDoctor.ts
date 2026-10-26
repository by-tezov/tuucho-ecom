import { join, resolve } from 'node:path';
import { applicationRoot, shopRoot } from '../src/config/applicationRoot.js';
import { migrateStampBehind } from '../src/config/configMigrate.js';
import {
  envSummary,
  flattenConfigToEnv,
  formatConfigReport,
  inspectConfig,
} from '../src/config/loadJsonConfig.js';

const status = inspectConfig(applicationRoot);
const report = formatConfigReport(status, envSummary(applicationRoot));
console.log(report);
if (status.ok && status.merged) {
  const flattened = flattenConfigToEnv(status.merged);
  const outputDir = flattened.OUTPUT_DIR?.trim()
    ? resolve(shopRoot, flattened.OUTPUT_DIR)
    : join(shopRoot, 'output');
  console.log(`output dir: ${outputDir}`);
}
const behind = await migrateStampBehind(shopRoot, applicationRoot);
if (behind.length > 0) {
  console.warn(
    `warning: config migrate stamp behind factory (${behind.join(', ')}). Run npm run config:migrate.`,
  );
}
if (!status.ok) process.exit(1);
