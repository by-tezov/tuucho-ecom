import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, Page, TestInfo } from 'patchright/test';

type NetEvent = {
  at: string;
  type: 'test-start' | 'test-end' | 'response' | 'requestfailed' | 'console-error';
  test?: string;
  url?: string;
  method?: string;
  status?: number | null;
  httpVersion?: string | null;
  error?: string;
  resourceType?: string;
};

function diagDir(): string | null {
  return process.env.PAM_TEST_DIAG_DIR || null;
}

async function appendDiag(event: NetEvent): Promise<void> {
  const dir = diagDir();
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, 'browser-network.ndjson'), `${JSON.stringify(event)}\n`, 'utf8');
}

/** Attach network/console probes for one-shot path diagnostics. */
export async function attachDiagNetworkLogging(
  context: BrowserContext,
  testInfo: TestInfo,
): Promise<void> {
  if (!diagDir()) return;
  const testName = testInfo.titlePath.join(' › ');
  await appendDiag({ at: new Date().toISOString(), type: 'test-start', test: testName });

  context.on('response', async (response) => {
    try {
      const status = response.status();
      const url = response.url();
      if (!/pamsurin\.fr/i.test(url)) return;
      const req = response.request();
      const httpVersion = typeof (response as { httpVersion?: () => string }).httpVersion === 'function'
        ? (response as { httpVersion: () => string }).httpVersion()
        : null;
      // Log failures and also asset responses during gallery-ish paths for volume.
      const notable =
        status >= 400 ||
        status === 0 ||
        /\/(gallery|assets\/)/.test(url);
      if (!notable) return;
      // Bound volume: only non-200 assets + all errors
      if (status === 200 && /\/assets\//.test(url)) return;
      await appendDiag({
        at: new Date().toISOString(),
        type: 'response',
        test: testName,
        url,
        method: req.method(),
        status,
        httpVersion,
        resourceType: req.resourceType(),
      });
    } catch {
      // ignore logging races
    }
  });

  context.on('requestfailed', async (request) => {
    try {
      const url = request.url();
      if (!/pamsurin\.fr/i.test(url)) return;
      await appendDiag({
        at: new Date().toISOString(),
        type: 'requestfailed',
        test: testName,
        url,
        method: request.method(),
        status: request.failure() ? null : null,
        error: request.failure()?.errorText,
        resourceType: request.resourceType(),
      });
    } catch {
      // ignore
    }
  });
}

export async function attachDiagPageLogging(page: Page, testInfo: TestInfo): Promise<() => Promise<void>> {
  if (!diagDir()) return async () => undefined;
  const testName = testInfo.titlePath.join(' › ');
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    void appendDiag({
      at: new Date().toISOString(),
      type: 'console-error',
      test: testName,
      error: msg.text().slice(0, 500),
    });
  });
  return async () => {
    await appendDiag({ at: new Date().toISOString(), type: 'test-end', test: testName });
  };
}
