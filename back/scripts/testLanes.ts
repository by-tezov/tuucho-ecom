import { formatIndexSection, formatMs } from '../src-test/dev/support/cleanListReporter.js';

/** Desktop shop port. Stable so Chrome's device-permission prompt is not repeated. */
export const DEFAULT_WEB_FRONT_PORT = 4173;
/** Handset shop port, used only when desktop and mobile run side by side. */
export const DEFAULT_MOBILE_FRONT_PORT = 4174;
export type TestLaneId = 'web' | 'mobile';

export type TestLanePlan = {
  id: TestLaneId;
  projects: string[];
  frontPort: number;
  /** When false, the desktop project owns catalogue teardown. */
  includeHandset: boolean;
};

export type LaneSummary = {
  status: string;
  passed: number;
  total: number;
  failed: string[];
  notExecuted: string[];
  titles: Record<string, string>;
};

export function parseFrontPort(raw: string | undefined, fallback: number, name: string): number {
  const text = raw?.trim();
  const port = text ? Number(text) : fallback;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`[test] ${name} must be an integer between 1024 and 65535.`);
  }
  return port;
}

/** Shop ports for a side-by-side functional run. The two origins must differ. */
export function resolveSideBySideFrontPorts(
  env: { PAM_TEST_WEB_FRONT_PORT?: string; PAM_TEST_MOBILE_FRONT_PORT?: string } = process.env,
): { web: number; mobile: number } {
  const web = parseFrontPort(env.PAM_TEST_WEB_FRONT_PORT, DEFAULT_WEB_FRONT_PORT, 'PAM_TEST_WEB_FRONT_PORT');
  const mobile = parseFrontPort(
    env.PAM_TEST_MOBILE_FRONT_PORT,
    DEFAULT_MOBILE_FRONT_PORT,
    'PAM_TEST_MOBILE_FRONT_PORT',
  );
  if (web === mobile) {
    throw new Error('[test] PAM_TEST_MOBILE_FRONT_PORT must differ from PAM_TEST_WEB_FRONT_PORT.');
  }
  return { web, mobile };
}

/**
 * Two environments only when both functional viewports are in the run.
 * `--api` stays one environment, the same way `--load` does.
 */
export function planSideBySideLanes(
  projects: readonly string[],
  ports: { web: number; mobile: number },
): TestLanePlan[] | null {
  if (projects.includes('api')) return null;
  if (!projects.includes('functional-web') || !projects.includes('functional-handset')) return null;
  return [
    { id: 'web', projects: ['functional-web'], frontPort: ports.web, includeHandset: false },
    { id: 'mobile', projects: ['functional-handset'], frontPort: ports.mobile, includeHandset: true },
  ];
}

export function titlesForLane(titles: readonly string[], lane: TestLaneId): string[] {
  return titles.filter((title) => (lane === 'mobile' ? /\bmobile\b/i.test(title) : !/\bmobile\b/i.test(title)));
}

export function indexesForLane(indexes: readonly number[] | null, lane: TestLaneId): number[] | null {
  if (!indexes) return null;
  return indexes.filter((index) => (lane === 'mobile' ? index >= 1001 : index < 1001));
}

/** Shift a `left,top` origin by the desktop window width. Invalid input is left unchanged. */
export function offsetWindowPosition(raw: string | undefined, deltaX: number): string {
  const source = raw?.trim() || '0,0';
  const match = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(source);
  if (!match) return source;
  return `${Number(match[1]) + deltaX},${match[2]}`;
}

/** Handset window sits immediately to the right of the desktop window. */
export function laneWindowPosition(lane: TestLaneId, raw: string | undefined, webWindowWidth: number): string {
  const origin = raw?.trim() || '0,0';
  if (lane !== 'mobile') return origin;
  return offsetWindowPosition(origin, webWindowWidth);
}

export function readLaneSummary(raw: string): LaneSummary {
  const parsed = JSON.parse(raw) as Partial<LaneSummary>;
  return {
    status: typeof parsed.status === 'string' ? parsed.status : 'failed',
    passed: typeof parsed.passed === 'number' ? parsed.passed : 0,
    total: typeof parsed.total === 'number' ? parsed.total : 0,
    failed: Array.isArray(parsed.failed) ? parsed.failed.map(String) : [],
    notExecuted: Array.isArray(parsed.notExecuted) ? parsed.notExecuted.map(String) : [],
    titles: parsed.titles && typeof parsed.titles === 'object' ? parsed.titles : {},
  };
}

/** One end-of-run block for every side-by-side environment. */
export function mergeLaneSummaries(
  lanes: readonly LaneSummary[],
  elapsedMs: number,
  rerunBase: string | undefined,
): string {
  const passed = lanes.reduce((sum, lane) => sum + lane.passed, 0);
  const total = lanes.reduce((sum, lane) => sum + lane.total, 0);
  const titles = new Map<string, string>();
  for (const lane of lanes) {
    for (const [index, title] of Object.entries(lane.titles)) titles.set(index, title);
  }
  const failed = [...new Set(lanes.flatMap((lane) => lane.failed))].sort((a, b) => Number(a) - Number(b));
  const notExecuted = [...new Set(lanes.flatMap((lane) => lane.notExecuted))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const status =
    lanes.every((lane) => lane.status === 'passed') && failed.length === 0 && notExecuted.length === 0
      ? 'passed'
      : 'failed';
  let text = `\n  ${status}\n`;
  text += `  Tests passed: ${passed}/${total}\n`;
  text += `  Total duration: ${formatMs(elapsedMs)}\n`;
  text += formatIndexSection('Failed tests', failed, titles);
  text += formatIndexSection('Not executed tests', notExecuted, titles);
  if (rerunBase && failed.length > 0) text += `  ${rerunBase} --index "${failed.join(' ')}"\n`;
  return text;
}
