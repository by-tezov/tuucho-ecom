import { applicationRoot } from '../src/config/applicationRoot.js';
import { envSummary, formatConfigReport, inspectConfig } from '../src/config/loadJsonConfig.js';

const status = inspectConfig(applicationRoot);
const report = formatConfigReport(status, envSummary(applicationRoot));
console.log(report);
if (!status.ok) process.exit(1);
