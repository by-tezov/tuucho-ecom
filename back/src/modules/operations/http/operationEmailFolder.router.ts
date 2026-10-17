import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { config } from '../../../config/env.js';

const MAX_LIST = 40;
const MAX_HTML_BYTES = 200_000;
const SELECTOR_APP_ROOT = `private_html/${config.target}/current`;
const ENV_VAR_KEY = 'ROUTE_EMAIL_FOLDER';

export const operationEmailFolderRouter = Router();

function refuseProd(res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (config.target !== 'prod') return false;
  res.status(404).json({ success: false, error: { code: 'not_found' } });
  return true;
}

interface SelectorGetResult {
  available_versions: Record<
    string,
    { users?: Record<string, { applications?: Record<string, { env_vars: Record<string, string> }> }> }
  >;
}

/** cPanel's Node.js Selector, called from inside the process it manages —
 * PATH on this host includes /usr/sbin, where cloudlinux-selector lives, so
 * no absolute path is needed. Only ever runs on preprod (see the route
 * guard below): dev has no selector at all, and prod ignores this env var
 * by design (config/env.ts), so there is nothing for it to do there. */
function currentSelectorEnvVars(): Record<string, string> {
  const raw = execFileSync('cloudlinux-selector', ['get', '--interpreter', 'nodejs', '--json'], {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(raw) as SelectorGetResult;
  for (const versionInfo of Object.values(parsed.available_versions)) {
    for (const user of Object.values(versionInfo.users ?? {})) {
      const app = user.applications?.[SELECTOR_APP_ROOT];
      if (app) return app.env_vars;
    }
  }
  throw new Error(`cloudlinux-selector has no application registered at ${SELECTOR_APP_ROOT}`);
}

/** Sets exactly one env var on the live cPanel app — this is the real,
 * permanent process env (see config/env.ts), never a DB row. Every other key
 * already on the app is preserved untouched. Returns the previous value.
 * Does not restart: see restartSelectorApp for why that is a separate step. */
function setSelectorEnvVar(key: string, value: string): string | undefined {
  const envVars = currentSelectorEnvVars();
  const previous = envVars[key];
  execFileSync('cloudlinux-selector', [
    'set',
    '--interpreter',
    'nodejs',
    '--app-root',
    SELECTOR_APP_ROOT,
    '--env-vars',
    JSON.stringify({ ...envVars, [key]: value }),
    '--json',
  ]);
  return previous;
}

/** Restarts the app so it picks up the new env — which kills this very
 * process, so the caller's response has to be flushed first. The caller
 * then polls `/healthz` to know when the restarted app is actually ready. */
function restartSelectorApp(): void {
  execFileSync('cloudlinux-selector', [
    'restart',
    '--interpreter',
    'nodejs',
    '--app-root',
    SELECTOR_APP_ROOT,
    '--json',
  ]);
}

function parseMeta(html: string): { to: string; subject: string } {
  const block = html.match(/<!--([\s\S]*?)-->/);
  const meta = block?.[1] ?? '';
  const to = meta.match(/^To:\s*(.+)$/m)?.[1]?.trim() ?? '';
  const subject = meta.match(/^Subject:\s*(.+)$/m)?.[1]?.trim() ?? '';
  return { to, subject };
}

function dirForKind(kind: string): string | undefined {
  if (kind === 'spy') return config.devEmailSpyDir;
  return config.devEmailDir;
}

type FolderMail = {
  to: string;
  subject: string;
  html: string;
  mtimeMs: number;
};

function listFolderMails(
  kind: string,
  toIncludes: string | undefined,
  sinceMs: number | undefined,
): FolderMail[] {
  const dir = dirForKind(kind);
  if (!dir) return [];
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.html'));
  } catch {
    return [];
  }
  const mails: FolderMail[] = [];
  for (const name of names) {
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (sinceMs !== undefined && st.mtimeMs < sinceMs) continue;
    if (st.size > MAX_HTML_BYTES) continue;
    let html: string;
    try {
      html = readFileSync(path, 'utf-8');
    } catch {
      continue;
    }
    const { to, subject } = parseMeta(html);
    if (toIncludes && !to.toLowerCase().includes(toIncludes.toLowerCase())) continue;
    mails.push({ to, subject, html, mtimeMs: st.mtimeMs });
  }
  mails.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return mails.slice(0, MAX_LIST);
}

/** `ROUTE_EMAIL_FOLDER` is a plain process env var (see config/env.ts) — no
 * DB override. GET reads this process's own current value; PUT (preprod
 * only) changes the real cPanel env var and restarts the app, same as a
 * manual cloudlinux-selector edit would, so the deployed env is always the
 * single source of truth for what a given process is actually doing. This
 * is what `npm run operation -- email-folder <true|false> --preprod`
 * and the preprod functional-test harness both call, over either
 * transport (--ssh or --ftp — both already reach this same loopback route
 * via withOpsTunnel.ts). */
operationEmailFolderRouter.get('/email-folder', (_req, res) => {
  if (refuseProd(res)) return;
  res.json({ success: true, data: { enabled: config.routeEmailFolder } });
});

operationEmailFolderRouter.put('/email-folder', (req, res) => {
  if (config.target !== 'preprod') {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  let previous: string | undefined;
  try {
    previous = setSelectorEnvVar(ENV_VAR_KEY, enabled ? 'true' : 'false');
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'selector_failed', message: error instanceof Error ? error.message : String(error) },
    });
    return;
  }
  // Answer first, restart once the bytes are out. The restart terminates this
  // process, so anything written after it never reaches the caller — which is
  // what made the CLI see a dropped connection instead of its own result.
  res.json({ success: true, data: { enabled, previousEnabled: previous === 'true', restarting: true } });
  res.on('finish', () => {
    try {
      restartSelectorApp();
    } catch (error) {
      console.error('[email-folder] selector restart failed', error);
    }
  });
});

operationEmailFolderRouter.get('/email-folder/mails', async (req, res) => {
  if (refuseProd(res)) return;
  const kind = typeof req.query.kind === 'string' ? req.query.kind : 'user';
  if (kind !== 'user' && kind !== 'spy') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const toIncludes = typeof req.query.to === 'string' ? req.query.to : undefined;
  const sinceRaw = typeof req.query.sinceMs === 'string' ? Number(req.query.sinceMs) : undefined;
  const sinceMs = sinceRaw !== undefined && Number.isFinite(sinceRaw) ? sinceRaw : undefined;
  const mails = listFolderMails(kind, toIncludes, sinceMs);
  res.json({ success: true, data: { mails } });
});
