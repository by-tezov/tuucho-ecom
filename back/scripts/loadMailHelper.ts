/**
 * Tiny HTTP helper so k6 VUs can read OTPs / reset tokens from disposable
 * DEV email dumps (same files Patchright mail.ts uses). Load-only.
 *
 * Scans are bounded by filename timestamp + subject slug so polls never read
 * the whole dump tree (or every recent contact/order mail).
 */
import { createServer, type Server } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface DevMail {
  to: string;
  subject: string;
  html: string;
  mtimeMs: number;
}

function listRecentMails(dir: string, sinceMs: number, nameHint?: RegExp): DevMail[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.html'));
  } catch {
    return [];
  }
  // writeDevEmail names files `${Date.now()}-${hex8}-${slugified-subject}.html`.
  const minNameTs = Math.max(0, sinceMs - 2_000);
  const recent: DevMail[] = [];
  for (const name of names) {
    if (nameHint && !nameHint.test(name)) continue;
    const nameTs = Number(name.split('-', 1)[0]);
    if (Number.isFinite(nameTs) && nameTs < minNameTs) continue;
    const path = join(dir, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs < sinceMs) continue;
    const html = readFileSync(path, 'utf8');
    const block = html.match(/<!--([\s\S]*?)-->/);
    const meta = block?.[1] ?? '';
    const to = meta.match(/^To:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const subject = meta.match(/^Subject:\s*(.+)$/m)?.[1]?.trim() ?? '';
    recent.push({ to, subject, html, mtimeMs });
  }
  return recent.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function findMail(
  dir: string,
  toIncludes: string,
  sinceMs: number,
  nameHint?: RegExp,
): DevMail | undefined {
  const needle = toIncludes.toLowerCase();
  return listRecentMails(dir, sinceMs, nameHint).find((mail) =>
    mail.to.toLowerCase().includes(needle),
  );
}

const OTP_RE = /\b(\d{6})\b/;
/** Matches writeDevEmail's slugify of the sign-in code subject, in French
 * ("Votre code de connexion") or the English a request without a language gets. */
const OTP_NAME_RE = /code-de-connexion|sign-in-code/;
/** Password-reset dumps (confirm-email is not used for reset tokens). */
const TOKEN_NAME_RE = /r-initialisation|reinitialisation|mot-de-passe|reset-password|reset-your-password/;

/** Prefer the body OTP: the HTML meta comment's To: line embeds Date.now()
 * and a random local-part that can contain other 6-digit runs. */
function extractOtp(html: string): string | undefined {
  const body = html.replace(/<!--([\s\S]*?)-->/, '');
  return body.match(OTP_RE)?.[1] ?? html.match(OTP_RE)?.[1];
}

export function startLoadMailHelper(emailUserDir: string): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const to = url.searchParams.get('to') ?? '';
      const sinceMs = Number(url.searchParams.get('sinceMs') ?? '0');
      if (!to) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'to_required' }));
        return;
      }
      const since = Number.isFinite(sinceMs) ? sinceMs : 0;
      if (url.pathname === '/otp') {
        const mail = findMail(emailUserDir, to, since, OTP_NAME_RE);
        if (!mail) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'not_found' }));
          return;
        }
        const otp = extractOtp(mail.html);
        if (!otp) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'otp_missing' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, otp }));
        return;
      }
      if (url.pathname === '/token') {
        const mail = findMail(emailUserDir, to, since, TOKEN_NAME_RE);
        if (!mail) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'not_found' }));
          return;
        }
        const decoded = mail.html.replaceAll('&#x3D;', '=').replaceAll('&#61;', '=').replaceAll('&amp;', '&');
        const token =
          decoded.match(/(?:confirm-email|reset-password)\?token=([A-Za-z0-9._~-]+)/i)?.[1] ??
          decoded.match(/token=([A-Za-z0-9._~-]+)/i)?.[1];
        if (!token) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'token_missing' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, token }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'not_found' }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: String(error) }));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('[test] load mail helper failed to bind'));
        return;
      }
      const url = `http://127.0.0.1:${address.port}`;
      console.error(`[test] load mail helper: ${url} (dir=${emailUserDir})`);
      resolve({
        url,
        close: () => {
          server.close();
        },
      });
    });
  });
}
