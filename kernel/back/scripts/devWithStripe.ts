/** Runs the dev server together with `stripe listen`, so a plain `npm run
 * dev` is enough to get webhook forwarding locally — Ctrl+C stops both.
 *
 * Best-effort: if the Stripe CLI isn't installed or isn't logged in, this
 * warns and starts the server anyway without a forwarding tunnel. */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { inspectConfig } from '../src/config/loadJsonConfig.js';
import { stripeListenArgs } from './stripeListenArgs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.APP_PORT ?? '3010';
const forwardTo = `localhost:${port}/webhooks/stripe`;
const appTarget = process.env.APP_TARGET || 'dev';

function mergedDevPrivate(): { databaseUrl?: string; encryptionKey?: string } {
  const status = inspectConfig(root, appTarget);
  if (!status.ok || !status.merged) return {};
  const database = status.merged.database;
  const pii = status.merged.pii;
  const databaseUrl =
    database && typeof database === 'object' && !Array.isArray(database)
      ? typeof (database as { url?: unknown }).url === 'string'
        ? (database as { url: string }).url
        : undefined
      : undefined;
  const encryptionKey =
    pii && typeof pii === 'object' && !Array.isArray(pii)
      ? typeof (pii as { encryptionKey?: unknown }).encryptionKey === 'string'
        ? (pii as { encryptionKey: string }).encryptionKey
        : undefined
      : undefined;
  return { databaseUrl, encryptionKey };
}

async function syncWebhookSecret(): Promise<boolean> {
  let currentSecret: string;
  try {
    currentSecret = execSync('stripe listen --print-secret', { encoding: 'utf-8' }).trim();
  } catch {
    console.warn('[dev] stripe CLI not available or not logged in — starting without webhook forwarding.');
    return false;
  }
  const { databaseUrl, encryptionKey } = mergedDevPrivate();
  if (!databaseUrl) {
    console.warn('[dev] no private JSON database.url — skipping webhook secret store.');
    return true;
  }
  if (!encryptionKey) {
    console.warn('[dev] no pii.encryptionKey — skipping webhook secret store.');
    return true;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { sealPluginSecrets, unsealPluginSecrets } = await import(
      '../src/modules/plugins/application/pluginSecretsCrypto.js'
    );
    const { rows } = await pool.query<{ secrets: unknown }>(`select secrets from plugins where id = $1`, [
      'tuucho-payment-stripe',
    ]);
    const next = unsealPluginSecrets(rows[0]?.secrets, encryptionKey);
    next.webhookSecret = currentSecret;
    await pool.query(
      `update plugins
          set secrets = to_jsonb($2::text), updated_at = now()
        where id = $1`,
      ['tuucho-payment-stripe', sealPluginSecrets(next, encryptionKey)],
    );
  } catch (error) {
    console.warn(
      `[dev] could not store Stripe webhook secret in the plugin secret store: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    await pool.end();
  }
  return true;
}

const stripeAvailable = await syncWebhookSecret();

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
