/** Runs the dev server together with `stripe listen`, so a plain `npm run
 * dev` is enough to get webhook forwarding locally. Ctrl+C stops both.
 *
 * The credential is the user project's Stripe secret key (plugin private
 * config, or the plugin secret store). The tuucho platform tree has none,
 * so it does not contact Stripe. A saved `stripe login` on the machine is
 * not used. If the CLI is missing or Stripe rejects the project key, the
 * API still starts without forwarding.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { inspectConfig } from '../src/config/loadJsonConfig.js';
import { configRoot } from '../src/config/shopPaths.js';
import { isUsableStripeSecretKey, stripeListenArgs } from './stripeListenArgs.js';

const port = process.env.APP_PORT ?? '3010';
const forwardTo = `localhost:${port}/webhooks/stripe`;
const appTarget = process.env.APP_TARGET || 'dev';

function mergedDevPrivate(): { databaseUrl?: string; encryptionKey?: string } {
  const status = inspectConfig(configRoot, appTarget);
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

function stripeEnv(secretKey: string): NodeJS.ProcessEnv {
  return { ...process.env, STRIPE_API_KEY: secretKey };
}

/** Real private files only. The committed example (`replace-me`) is not a key. */
function secretFromPrivateFiles(): string | undefined {
  const dir = join(configRoot, 'plugins', 'tuucho-payment-stripe');
  let value: unknown;
  let seen = false;
  for (const name of ['config.private.json', `config.private.${appTarget}.json`]) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('secretKey' in parsed))
        continue;
      seen = true;
      value = (parsed as { secretKey: unknown }).secretKey;
    } catch {
      // Ignore a broken layer and keep looking.
    }
  }
  return seen && typeof value === 'string' && isUsableStripeSecretKey(value) ? value.trim() : undefined;
}

async function secretFromStore(): Promise<string | undefined> {
  const { databaseUrl, encryptionKey } = mergedDevPrivate();
  if (!databaseUrl || !encryptionKey) return undefined;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { unsealPluginSecrets } = await import('../src/modules/plugins/application/pluginSecretsCrypto.js');
    const { rows } = await pool.query<{ secrets: unknown }>(`select secrets from plugins where id = $1`, [
      'tuucho-payment-stripe',
    ]);
    const secret = unsealPluginSecrets(rows[0]?.secrets, encryptionKey).secretKey;
    return isUsableStripeSecretKey(secret) ? secret.trim() : undefined;
  } catch {
    return undefined;
  } finally {
    await pool.end();
  }
}

async function projectSecretKey(): Promise<string | undefined> {
  return secretFromPrivateFiles() ?? (await secretFromStore());
}

let stripeSecretKey: string | undefined;

async function syncWebhookSecret(): Promise<boolean> {
  stripeSecretKey = await projectSecretKey();
  if (!stripeSecretKey) {
    console.warn('[dev] this project has no Stripe secret key. Starting without webhook forwarding.');
    return false;
  }
  let currentSecret: string;
  try {
    currentSecret = execSync('stripe listen --print-secret', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: stripeEnv(stripeSecretKey),
    }).trim();
  } catch {
    console.warn('[dev] Stripe rejected the project secret key. Starting without webhook forwarding.');
    return false;
  }
  const { databaseUrl, encryptionKey } = mergedDevPrivate();
  if (!databaseUrl) {
    console.warn('[dev] no private JSON database.url. Skipping webhook secret store.');
    return true;
  }
  if (!encryptionKey) {
    console.warn('[dev] no pii.encryptionKey. Skipping webhook secret store.');
    return true;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { sealPluginSecrets, unsealPluginSecrets } =
      await import('../src/modules/plugins/application/pluginSecretsCrypto.js');
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
if (stripeAvailable && stripeSecretKey) {
  children.push(
    spawn('stripe', stripeListenArgs(forwardTo), { stdio: 'inherit', env: stripeEnv(stripeSecretKey) }),
  );
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
