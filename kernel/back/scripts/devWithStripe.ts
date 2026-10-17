/** Runs the dev server together with `stripe listen`, so a plain `npm run
 * dev` is enough to get webhook forwarding locally — Ctrl+C stops both.
 *
 * `stripe listen`'s webhook signing secret is stable for a given
 * authenticated CLI session, but does change if you re-run `stripe login`
 * or switch Stripe accounts — a stale STRIPE_WEBHOOK_SECRET in
 * .env/dev/.private.env then breaks every local webhook signature check
 * with no useful error (Stripe's own retry logic just looks like nothing
 * happening). So before starting anything, this asks the CLI for the
 * secret it's actually using right now (`--print-secret`, no forwarding)
 * and rewrites the env file in place if it differs.
 *
 * Best-effort: if the Stripe CLI isn't installed or isn't logged in, this
 * warns and starts the server anyway without a forwarding tunnel — the
 * rest of the app (and even checkout itself, via the finalize fast path)
 * still works, only the webhook backstop is unavailable locally without it. */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { stripeListenArgs } from './stripeListenArgs.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.APP_PORT ?? '3000';
const forwardTo = `localhost:${port}/webhooks/stripe`;
const privateEnvPath = join(root, '.env', 'dev', '.private.env');

function syncWebhookSecret(): boolean {
  let currentSecret: string;
  try {
    currentSecret = execSync('stripe listen --print-secret', { encoding: 'utf-8' }).trim();
  } catch {
    console.warn('[dev] stripe CLI not available or not logged in — starting without webhook forwarding.');
    return false;
  }

  const contents = existsSync(privateEnvPath) ? readFileSync(privateEnvPath, 'utf-8') : '';
  const lines = contents.split('\n');
  const lineIndex = lines.findIndex((line) => line.startsWith('STRIPE_WEBHOOK_SECRET='));
  const existingSecret =
    lineIndex === -1 ? undefined : lines[lineIndex]!.slice('STRIPE_WEBHOOK_SECRET='.length).trim();

  if (existingSecret === currentSecret) return true;

  if (lineIndex === -1) lines.push(`STRIPE_WEBHOOK_SECRET=${currentSecret}`);
  else lines[lineIndex] = `STRIPE_WEBHOOK_SECRET=${currentSecret}`;
  writeFileSync(privateEnvPath, lines.join('\n'));
  console.log(
    `[dev] STRIPE_WEBHOOK_SECRET ${existingSecret ? 'updated (was stale)' : 'added'} in .env/dev/.private.env.`,
  );
  return true;
}

const stripeAvailable = syncWebhookSecret();

const children: ChildProcess[] = [
  spawn('tsx', ['watch', 'src/server.ts'], { stdio: 'inherit', env: { ...process.env, APP_TARGET: 'dev' } }),
];
if (stripeAvailable) {
  children.push(spawn('stripe', stripeListenArgs(forwardTo), { stdio: 'inherit' }));
}

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const child of children) child.on('exit', shutdown);
