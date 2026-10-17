import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applicationRoot } from './applicationRoot.js';

const packageData = JSON.parse(readFileSync(join(applicationRoot, 'package.json'), 'utf8')) as {
  version?: unknown;
};

if (typeof packageData.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageData.version)) {
  throw new Error('package.json must contain a semantic version');
}

/** Bare `package.json` version (`0.9.8`). Use for backup ids / manifests. */
export const packageVersion = packageData.version;

/** Display form (`v0.9.8`) for chat subjects, email headers, etc. */
export const appVersion = `v${packageVersion}`;
