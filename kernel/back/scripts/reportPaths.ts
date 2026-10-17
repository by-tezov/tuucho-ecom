import { join } from 'node:path';

/** Root for readable HTML unit-coverage reports. */
export function reportRoot(repoRoot: string): string {
  return join(repoRoot, 'output/report');
}
