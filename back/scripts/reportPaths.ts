import { join } from 'node:path';

/** Root for all readable HTML test reports (Patchright, k6, coverage). */
export function reportRoot(repoRoot: string): string {
  return join(repoRoot, 'output/report');
}

/** Patchright HTML folder. Web and mobile functional reports are separate. */
export function patchrightReportDir(
  repoRoot: string,
  opts: { functional: boolean; api: boolean; viewport?: 'web' | 'mobile' },
): string {
  const base = reportRoot(repoRoot);
  if (opts.functional && opts.viewport === 'mobile') return join(base, 'functional-mobile');
  if (opts.functional) return join(base, 'functional-web');
  if (opts.api) return join(base, 'api');
  return join(base, 'functional-web');
}

export function loadReportDir(repoRoot: string): string {
  return join(reportRoot(repoRoot), 'load');
}
