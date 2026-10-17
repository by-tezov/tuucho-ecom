import { writeFileSync } from 'node:fs';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from 'patchright/types/testReporter';

type BufferedAction = {
  title: string;
  duration: number;
  error: boolean;
};

function suiteTitle(test: TestCase): string {
  return test
    .titlePath()
    .filter((part) => part && !/\.(spec|test)\.[cm]?[jt]sx?$/.test(part))
    .slice(1) // drop project name (api / functional)
    .join(' › ');
}

export function formatMs(ms: number): string {
  if (ms >= 60_000) {
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function hasAncestor(step: TestStep, predicate: (candidate: TestStep) => boolean): boolean {
  let current = step.parent;
  while (current) {
    if (predicate(current)) return true;
    current = current.parent;
  }
  return false;
}

function isHttpStepTitle(title: string): boolean {
  return /^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+\//i.test(title.trim());
}

function isFixtureOrHook(step: TestStep): boolean {
  return (
    step.category === 'fixture' ||
    step.category === 'hook' ||
    hasAncestor(step, (candidate) => candidate.category === 'fixture' || candidate.category === 'hook')
  );
}

function isInternalChild(step: TestStep): boolean {
  return hasAncestor(
    step,
    (candidate) =>
      candidate.category === 'pw:api' ||
      candidate.category === 'expect' ||
      (candidate.category === 'test.step' && isHttpStepTitle(candidate.title)),
  );
}

const INTERNAL_API_TITLE =
  /^(Query count|Evaluate|Wait for event|Wait for selector|Is visible|Is hidden|Is enabled|Is disabled|Get attribute)\b/i;

function roleNameFromOptions(options: string): string | undefined {
  const regexName = /name:\s*\/([^/]+)\/[a-z]*/.exec(options);
  if (regexName) return regexName[1];
  const quoted = /name:\s*'([^']+)'/.exec(options) ?? /name:\s*"([^"]+)"/.exec(options);
  return quoted?.[1];
}

/** Playwright locator fragments → short labels a human can scan. */
function humanizeLocator(raw: string): string {
  let text = raw.trim();
  text = text.replace(
    /getByRole\(\s*'([^']+)'\s*,\s*\{([^}]*)\}\s*\)/gi,
    (_, role: string, options: string) => {
      const name = roleNameFromOptions(options);
      return name ? `${role} "${name}"` : role;
    },
  );
  text = text.replace(
    /getByRole\(\s*"([^"]+)"\s*,\s*\{([^}]*)\}\s*\)/gi,
    (_, role: string, options: string) => {
      const name = roleNameFromOptions(options);
      return name ? `${role} "${name}"` : role;
    },
  );
  text = text.replace(/getByRole\(\s*'([^']+)'\s*\)/gi, (_, role: string) => role);
  text = text.replace(/getByTestId\(\s*'([^']+)'\s*\)\.locator\('([^']+)'\)/gi, 'testid $1 $2');
  text = text.replace(/getByTestId\(\s*'([^']+)'\s*\)/gi, 'testid $1');
  text = text.replace(/getByTestId\(\s*"([^"]+)"\s*\)/gi, 'testid $1');
  text = text.replace(/getByLabel\(\s*'([^']+)'\s*\)/gi, 'label "$1"');
  text = text.replace(/getByPlaceholder\(\s*'([^']+)'\s*\)/gi, 'placeholder "$1"');
  text = text.replace(/getByText\(\s*\/([^/]+)\/[a-z]*\s*\)/gi, 'text "$1"');
  text = text.replace(/getByText\(\s*'([^']+)'\s*\)/gi, 'text "$1"');
  text = text.replace(/locator\('([^']*)'\)/g, '$1');
  text = text.replace(/locator\("([^"]*)"\)/g, '$1');
  text = text.replace(/\b(banner|navigation|main|contentinfo|complementary)\.(button|link|heading|textbox)\b/gi, '$1 $2');
  return text.replace(/\s+/g, ' ').trim();
}

function stripExpectQuotes(title: string): { matcher: string; rest: string } {
  const matched = /^Expect\s+"([^"]+)"\s*(.*)$/i.exec(title.trim());
  if (matched) return { matcher: matched[1], rest: matched[2].trim() };
  const dotted = /^expect\([^)]*\)\.(to\w+)\s*(.*)$/i.exec(title.trim());
  if (dotted) return { matcher: dotted[1], rest: dotted[2].trim() };
  return { matcher: '', rest: title.trim() };
}

const MATCHER_LABELS: Record<string, string> = {
  toBeVisible: 'visible',
  toBeHidden: 'hidden',
  toBeAttached: 'attached',
  toBeEnabled: 'enabled',
  toBeDisabled: 'disabled',
  toBeChecked: 'checked',
  toBeFocused: 'focused',
  toHaveURL: 'URL',
  toHaveTitle: 'title',
  toHaveText: 'text',
  toContainText: 'contains',
  toHaveValue: 'value',
  toHaveCount: 'count',
  toHaveAttribute: 'attribute',
  toHaveClass: 'class',
  toBeOK: 'response OK',
};

function humanizeExpect(title: string): string {
  const { matcher, rest } = stripExpectQuotes(title);
  const label = MATCHER_LABELS[matcher] ?? matcher.replace(/^to/, '').replace(/^[A-Z]/, (ch) => ch.toLowerCase());
  const target = humanizeLocator(rest);
  return [label, target].filter(Boolean).join(' ') || title;
}

function humanizeAction(title: string): string {
  let text = title.trim();
  text = text.replace(/^Scroll into view\s+/i, 'Scroll into view ');
  text = text.replace(/^Navigate to\s+/i, 'Navigate to ');
  text = text.replace(/^Click\s+/i, 'Click ');
  text = text.replace(/^Fill\s+/i, 'Fill ');
  text = text.replace(/^Type\s+/i, 'Type ');
  text = text.replace(/^Press\s+/i, 'Press ');
  text = text.replace(/^Check\s+/i, 'Check ');
  text = text.replace(/^Uncheck\s+/i, 'Uncheck ');
  text = text.replace(/^Select option\s+/i, 'Select ');
  text = text.replace(/^Hover\s+/i, 'Hover ');
  text = text.replace(/^Wait for\s+/i, 'Wait for ');
  text = text.replace(/^locator\.(click|fill|type|press|check|uncheck|hover|focus)\(\)/i, (_, verb: string) => verb);
  return humanizeLocator(text);
}

function resultMark(error: boolean, skipped: boolean): 'OK' | 'KO' | 'NO' {
  if (skipped) return 'NO';
  return error ? 'KO' : 'OK';
}

/**
 * One summary row. The title is `<what is tested>: <what is expected>` when
 * the spec follows that shape; otherwise it is the suite and test title as
 * written. A number with no collected test has no title.
 */
export function formatIndexedTestLine(index: string, title: string | undefined): string {
  return `    ${index}  ${title ?? 'not collected'}`;
}

export function formatIndexSection(
  label: string,
  indexes: readonly string[],
  titles: ReadonlyMap<string, string>,
): string {
  if (indexes.length === 0) return `  ${label}: none\n`;
  const lines = indexes.map((index) => formatIndexedTestLine(index, titles.get(index)));
  return `  ${label}:\n${lines.join('\n')}\n`;
}

/** Live list: prints when a test starts, each useful step, then the result. */
export default class CleanListReporter implements Reporter {
  private webIndex = 0;
  private mobileIndex = 1000;
  private current = '—';
  private indexes = new Map<string, string>();
  private titlesByIndex = new Map<string, string>();
  private indexOverrides = new Map<string, string>();
  private requestedIndexes: string[] = [];
  private finalStatuses = new Map<string, TestResult['status']>();
  private pendingAction = new Map<string, BufferedAction>();
  private totalTests = 0;
  private startedAt = 0;

  private get verbose(): boolean {
    return process.env.PAM_TEST_VERBOSE === '1';
  }

  private isRunnableTest(test: TestCase): boolean {
    return test.titlePath().some((part) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(part));
  }

  private isMobile(test: TestCase): boolean {
    return /\bmobile\b/i.test(suiteTitle(test));
  }

  private writeTriplet(action: string, expectation: string, mark: 'OK' | 'KO' | 'NO', durationMs: number): void {
    process.stdout.write(`      ACTION  ${action || 'no'}\n`);
    process.stdout.write(`      EXPECT  ${expectation || 'no'}\n`);
    process.stdout.write(`      RESULT  ${mark} (${formatMs(durationMs)})\n\n`);
  }

  private flushPending(testId: string, skipped = false): void {
    const pending = this.pendingAction.get(testId);
    if (!pending) return;
    this.pendingAction.delete(testId);
    this.writeTriplet(pending.title, 'no', resultMark(pending.error, skipped), pending.duration);
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startedAt = Date.now();
    try {
      const overrides = JSON.parse(process.env.PAM_TEST_INDEX_OVERRIDES ?? '{}') as Record<string, string>;
      this.indexOverrides = new Map(Object.entries(overrides));
    } catch {
      this.indexOverrides.clear();
    }
    try {
      const requested = JSON.parse(process.env.PAM_TEST_REQUESTED_INDEXES ?? '[]') as unknown;
      this.requestedIndexes = Array.isArray(requested)
        ? requested.map((index) => String(index)).filter((index) => /^\d+$/.test(index))
        : [];
    } catch {
      this.requestedIndexes = [];
    }
    const tests = suite.allTests().filter((test) => this.isRunnableTest(test));
    const testsByLocation = new Map<string, TestCase[]>();
    for (const test of tests) {
      const locationKey = `${test.location.file}:${test.location.line}`;
      const group = testsByLocation.get(locationKey) ?? [];
      group.push(test);
      testsByLocation.set(locationKey, group);
      const titleKey = `${locationKey}::${suiteTitle(test)}`;
      const index =
        this.indexOverrides.get(titleKey) ??
        this.indexOverrides.get(locationKey) ??
        String(this.isMobile(test) ? ++this.mobileIndex : ++this.webIndex);
      const indexText = String(index);
      this.indexes.set(test.id, indexText);
      const title = suiteTitle(test);
      const previous = this.titlesByIndex.get(indexText);
      this.titlesByIndex.set(indexText, previous ? `${previous} | ${title}` : title);
    }
    for (const [location, group] of testsByLocation) {
      const hasWeb = group.some((test) => !this.isMobile(test));
      const hasMobile = group.some((test) => this.isMobile(test));
      if (!hasWeb || !hasMobile) continue;
      process.stdout.write(
        `[test] warning: ${location} registers both desktop and mobile tests on one source line ` +
          `(${group.map((test) => suiteTitle(test)).join('; ')}). ` +
          'Index mapping uses titles (1–1000 desktop / 1001–2000 mobile); prefer separate test() lines.\n',
      );
    }
    // `suite.allTests()` can include tests belonging to projects that are not
    // selected by the CLI (and tests after an interrupted worker). The
    // reporter must use the indexed runnable set as its denominator; this is
    // also the set from which missing/never-started tests are reported below.
    // A requested index that Patchright never collected is still part of that
    // denominator — otherwise a dropped file filter prints "3/4" and
    // "not executed: none" for a 10-index run.
    const present = new Set(this.indexes.values());
    const missingRequested = this.requestedIndexes.filter((index) => !present.has(index));
    const accounted = new Set<string>([...this.requestedIndexes, ...present].filter((index) => /^\d+$/.test(index)));
    this.totalTests = this.requestedIndexes.length > 0 ? accounted.size : this.indexes.size;
    const runnableCount = this.indexes.size;
    process.stdout.write(`\nRunning ${runnableCount} test${runnableCount === 1 ? '' : 's'}\n\n`);
    if (missingRequested.length > 0) {
      process.stdout.write(
        `[test] requested indexes were not collected: ${missingRequested.join(', ')}\n\n`,
      );
    }
  }

  onTestBegin(test: TestCase): void {
    this.current = this.indexes.get(test.id) ?? 'setup';
    this.pendingAction.delete(test.id);
    process.stdout.write(`  →  ${this.current} ${suiteTitle(test)}\n`);
  }

  onStepBegin(test: TestCase, _result: TestResult, step: TestStep): void {
    if (this.verbose) return;
    if (step.category === 'test.step') process.stdout.write(`      · ${step.title}\n`);
    void test;
  }

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep): void {
    if (!this.verbose) return;
    if (isFixtureOrHook(step) || isInternalChild(step)) return;

    if (step.category === 'test.step') {
      if (isHttpStepTitle(step.title)) {
        this.flushPending(test.id);
        this.writeTriplet(
          step.title.trim(),
          'no',
          resultMark(Boolean(step.error), false),
          step.duration,
        );
        return;
      }
      if (/^expected:/i.test(step.title.trim())) {
        process.stdout.write(`      · ${step.title}\n`);
      }
      return;
    }

    if (step.category === 'expect') {
      const pending = this.pendingAction.get(test.id);
      this.pendingAction.delete(test.id);
      if (pending?.error) {
        this.writeTriplet(pending.title, 'no', 'KO', pending.duration);
        this.writeTriplet(
          'no',
          humanizeExpect(step.title),
          resultMark(Boolean(step.error), false),
          step.duration,
        );
        return;
      }
      this.writeTriplet(
        pending?.title ?? '',
        humanizeExpect(step.title),
        resultMark(Boolean(step.error), false),
        (pending?.duration ?? 0) + step.duration,
      );
      return;
    }

    if (step.category !== 'pw:api') return;
    if (INTERNAL_API_TITLE.test(step.title.trim())) return;
    this.flushPending(test.id);
    this.pendingAction.set(test.id, {
      title: humanizeAction(step.title),
      duration: step.duration,
      error: Boolean(step.error),
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const skipped = result.status === 'skipped' || result.status === 'interrupted';
    this.flushPending(test.id, skipped);
    const index = this.indexes.get(test.id) ?? 'setup';
    // A retry calls onTestEnd more than once; retain only its final result so
    // the end-of-run summary reports real remaining regressions.
    if (this.isRunnableTest(test)) this.finalStatuses.set(test.id, result.status);
    const mark =
      result.status === 'passed'
        ? '✓'
        : '✘';
    const duration = result.status === 'skipped' ? 'not executed' : formatMs(result.duration);
    process.stdout.write(
      `  ${mark}  ${index} ${suiteTitle(test)} (${duration})\n`,
    );
    if (result.status === 'failed' || result.status === 'timedOut') {
      for (const error of result.errors) {
        const message = error.message?.split('\n').slice(0, 8).join('\n');
        if (message) process.stdout.write(`\n${message}\n\n`);
      }
    }
    void this.current;
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    const failedIndexes = [...this.finalStatuses.entries()]
      .filter(([, status]) => status === 'failed' || status === 'timedOut' || status === 'interrupted')
      .map(([testId]) => this.indexes.get(testId))
      .filter((index): index is string => /^\d+$/.test(index ?? ''))
      .sort((a, b) => Number(a) - Number(b));
    const finished = new Set<string>();
    for (const [testId, status] of this.finalStatuses) {
      if (status === 'skipped') continue;
      const index = this.indexes.get(testId);
      if (index && /^\d+$/.test(index)) finished.add(index);
    }
    const notExecutedIndexes = [
      ...new Set([
        ...[...this.indexes.entries()]
          .filter(([testId]) => {
            const status = this.finalStatuses.get(testId);
            return status === undefined || status === 'skipped';
          })
          .map(([, index]) => index),
        ...this.requestedIndexes.filter((index) => !finished.has(index)),
      ]),
    ]
      .filter((index) => /^\d+$/.test(index))
      .sort((a, b) => Number(a) - Number(b));
    const passed = [...this.finalStatuses.values()].filter((status) => status === 'passed').length;
    const elapsedMs = result.duration ?? Date.now() - this.startedAt;

    // A skipped test is not evidence of a working feature. Treat it as a
    // failed run so callers and CI cannot accept a partial test matrix.
    const effectiveStatus = notExecutedIndexes.length > 0 && result.status === 'passed'
      ? 'failed'
      : result.status;
    const summary = {
      status: effectiveStatus,
      passed,
      total: this.totalTests,
      failed: failedIndexes,
      notExecuted: notExecutedIndexes,
      titles: Object.fromEntries(this.titlesByIndex),
    };
    const summaryFile = process.env.PAM_TEST_SUMMARY_FILE?.trim();
    if (summaryFile) writeFileSync(summaryFile, `${JSON.stringify(summary)}\n`);
    // Side-by-side environments each write a summary file. The orchestrator
    // prints one merged block after both lanes finish.
    if (process.env.PAM_TEST_DEFER_SUMMARY === '1') {
      return effectiveStatus === result.status ? undefined : { status: effectiveStatus };
    }
    process.stdout.write(`\n  ${effectiveStatus}\n`);
    process.stdout.write(`  Tests passed: ${passed}/${this.totalTests}\n`);
    process.stdout.write(`  Total duration: ${formatMs(elapsedMs)}\n`);
    process.stdout.write(formatIndexSection('Failed tests', failedIndexes, this.titlesByIndex));
    process.stdout.write(formatIndexSection('Not executed tests', notExecutedIndexes, this.titlesByIndex));
    const rerunBase = process.env.PAM_TEST_RERUN_BASE?.trim();
    if (rerunBase && failedIndexes.length > 0) {
      process.stdout.write(`  ${rerunBase} --index "${failedIndexes.join(' ')}"\n`);
    }
    return effectiveStatus === result.status ? undefined : { status: effectiveStatus };
  }
}
