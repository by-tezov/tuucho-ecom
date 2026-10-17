import { loadApiBaseUrl, loadOpsToken, type Mode } from './envFile.js';
import { opsRequestHeaders } from './opsHeaders.js';

export type OperatorActivityPayload = {
  category:
    | 'catalogue'
    | 'orders'
    | 'accounts'
    | 'loyalty'
    | 'gift'
    | 'promotions'
    | 'shipping'
    | 'messaging'
    | 'settings'
    | 'operations'
    | 'deploy';
  action: string;
  summary: string;
  outcome?: 'success' | 'failure';
  targetType?: string;
  targetId?: string;
  targets?: string[];
  detail?: unknown;
};

/** Best-effort journal line for a bulk CLI. Never throws: a failed journal
 * write must not undo a successful seed or deploy. */
export async function postOperatorActivity(
  root: string,
  mode: Mode | string,
  payload: OperatorActivityPayload,
): Promise<void> {
  try {
    const apiBaseUrl = loadApiBaseUrl(root, mode);
    const opsToken = loadOpsToken(root, mode);
    if (!apiBaseUrl || !opsToken) {
      console.error('[activity] journal skipped: missing ops endpoint or token');
      return;
    }
    const res = await fetch(`${apiBaseUrl}/operation/activity`, {
      method: 'POST',
      headers: opsRequestHeaders(opsToken, mode, { 'content-type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[activity] journal write failed: ${res.status} ${body}`);
    }
  } catch (error) {
    console.error(
      `[activity] journal write failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
