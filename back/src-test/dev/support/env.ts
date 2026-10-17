import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export type TestMode = 'dev' | 'preprod' | 'prod';

export interface TestEnv {
  root: string;
  mode: TestMode;
  apiBaseUrl: string;
  frontBaseUrl: string;
  emailUserDir: string;
  emailSpyDir: string;
  reportDir: string;
  tmpDir: string;
  frontRoot: string;
}

function loadEnvFile(fileName: string): Record<string, string> {
  const filePath = join(root, '.env', fileName);
  if (!existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function resolveDir(base: string, rel: string): string {
  const cleaned = rel.replace(/^\//, '');
  return join(root, base, cleaned);
}

/** Resolve paths/URLs for the active mode. Prefers PAM_* injected by the
 * orchestrator; falls back to layered .env files for direct `patchright test`. */
export function loadTestEnv(
  mode: TestMode = (process.env.PAM_TEST_MODE as TestMode) || 'dev',
): TestEnv {
  const publicEnv = {
    ...loadEnvFile('.public.env'),
    ...loadEnvFile(`${mode}/.public.env`),
  };

  const apiBaseUrl = process.env.PAM_API_BASE_URL ?? publicEnv.URL_API_BASE ?? 'http://localhost:3000';
  const frontBaseUrl =
    process.env.PAM_FRONT_BASE_URL ?? publicEnv.URL_FRONTEND_BASE ?? 'http://localhost:5173';
  const devDir = publicEnv.DEV_DIR ?? './output/dev';

  return {
    root,
    mode,
    apiBaseUrl,
    frontBaseUrl,
    emailUserDir:
      process.env.PAM_EMAIL_USER_DIR ??
      resolveDir(devDir, publicEnv.DEV_EMAIL_USER_DIR ?? '/email-user'),
    emailSpyDir:
      process.env.PAM_EMAIL_SPY_DIR ??
      resolveDir(devDir, publicEnv.DEV_EMAIL_SPY_DIR ?? '/email-spy'),
    reportDir: process.env.PAM_TEST_REPORT_DIR ?? join(root, 'output/report/functional-web'),
    tmpDir: process.env.PAM_TEST_TMP_DIR ?? join(root, 'output/test/tmp'),
    frontRoot: process.env.PAM_FRONT_ROOT ?? join(root, '../pamsurin-front'),
  };
}

export const testPassword = 'E2eTest1!';
export const testGiftPin = '2468';
export const testCardNumber = '4242424242424242';
export const testCardExpiry = '12/34';
export const testCardCvc = '123';
