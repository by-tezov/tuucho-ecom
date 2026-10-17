/**
 * Where configuration comes from, before anything is validated.
 *
 * Layered per target, each file overriding the last:
 * `.env/.public.env` -> `.env/<target>/.public.env` -> `.env/.private.env` ->
 * `.env/<target>/.private.env`. `APP_TARGET` is a real environment variable,
 * never a file, and startup throws without it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applicationRoot } from './applicationRoot.js';

/** Same split as kernel/front: .env/.public.env (committed, safe-to-commit
 * topology/config) + .env/.private.env (gitignored, actual secrets), plus a
 * per-target overlay of each under .env/<target>/ (see targetFileSuffix
 * below) — every later file in the load order overrides matching keys from
 * an earlier one. Same parsing as kernel/front's vite.config.ts
 * loadEnvFile. Files are resolved from the compiled/source tree (see
 * applicationRoot.ts), not `process.cwd()` — cron and cPanel pipes start
 * Node from `$HOME` while pointing at this release by absolute path.
 * A file that doesn't exist is silently skipped rather than an
 * error — lets a deploy that forgot to upload one of these fail loudly
 * instead at the `required()` checks below, with a clear missing-variable
 * message. */
function loadEnvFile(fileName: string): Record<string, string> {
  const filePath = resolve(applicationRoot, '.env', fileName);
  if (!existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const APP_TARGETS = ['dev', 'preprod', 'prod'] as const;
export type AppTarget = (typeof APP_TARGETS)[number];

/** APP_TARGET picks which per-target overlay to load on top of the common
 * .public.env/.private.env files — must be exactly 'dev', 'preprod', or
 * 'prod'; anything else (missing, misspelled, a stray "production") throws
 * rather than silently picking one. That matters more than it looks: a
 * production deploy that forgot to set this wouldn't just load the wrong
 * env files, it'd also flip `isDevelopment` on (see below), which relaxes
 * CORS to reflect any Origin — exactly the thing this var exists to keep
 * locked down in prod. Files load in this order, each overriding the last:
 * common public, target public, common private, target private (private
 * always wins over public on overlap). Deliberately not NODE_ENV: cPanel's
 * Node.js Selector has its own Application Mode dropdown
 * (production/development) that also drives a real NODE_ENV under the
 * hood, which would fight with a hand-set value here — using a separate
 * name keeps the two fully decoupled. Set once per deployed environment
 * through cPanel's "Environment Variables" field, same as every other env
 * var — see README "Deploying" (local dev sets it via the `dev` npm
 * script, not by hand). Can only ever be a real process env var, never
 * something inside one of the files it's choosing between
 * (chicken-and-egg). */
function requiredAppTarget(): AppTarget {
  const value = process.env.APP_TARGET;
  if (!(APP_TARGETS as readonly string[]).includes(value ?? '')) {
    throw new Error(
      `APP_TARGET must be one of ${APP_TARGETS.join('/')} (got ${value === undefined ? 'unset' : `"${value}"`}).`,
    );
  }
  return value as AppTarget;
}

const targetFileSuffix = requiredAppTarget();

/** Target files override shared files, while explicit process values (cPanel,
 * test-runner overrides, or a shell export) still win over both. */
const fileEnv = {
  ...loadEnvFile('.public.env'),
  ...loadEnvFile(`${targetFileSuffix}/.public.env`),
  ...loadEnvFile('.private.env'),
  ...loadEnvFile(`${targetFileSuffix}/.private.env`),
};
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

/** Apple AuthKey_<KEY_ID>.p8 next to that target's `.private.env`.
 * Prefer `.env/<target>/AuthKey_….p8`, then shared `.env/AuthKey_….p8`.
 * No APPLE_PRIVATE_KEY env — Key ID in public env is enough to find the file. */
function loadApplePrivateKeyFromFile(keyId: string | undefined, target: AppTarget): string | undefined {
  const id = keyId?.trim();
  if (!id) return undefined;
  if (!/^[A-Z0-9]{10}$/.test(id)) {
    throw new Error(`APPLE_KEY_ID must be a 10-character Apple Key ID (got "${id}").`);
  }
  const fileName = `AuthKey_${id}.p8`;
  const candidates = [
    resolve(applicationRoot, '.env', target, fileName),
    resolve(applicationRoot, '.env', fileName),
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const pem = readFileSync(filePath, 'utf-8').trim();
    if (!pem.includes('BEGIN PRIVATE KEY')) {
      throw new Error(`Apple private key file ${filePath} is not a PEM private key.`);
    }
    return pem;
  }
  return undefined;
}

/** Same "fail loudly at startup" spirit as kernel/front's src/config/env.ts —
 * a missing required value is a deploy-time mistake, not something to paper
 * over with a silent fallback. */

export { targetFileSuffix, fileEnv, loadApplePrivateKeyFromFile, APP_TARGETS };
