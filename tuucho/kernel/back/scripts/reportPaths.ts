import { join } from 'node:path';
import { outputRoot } from '../src/config/shopPaths.js';

/** Root for readable HTML unit-coverage reports. */
export function reportRoot(): string {
  return join(outputRoot(), 'report');
}
