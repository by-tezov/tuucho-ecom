#!/usr/bin/env node
/** Write shop Compose env outside tuucho/, then `docker compose up -d`. */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeComposeEnv } from './composeEnv.mjs';

const back = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const envFile = writeComposeEnv();
  const result = spawnSync('docker', ['compose', '--env-file', envFile, 'up', '-d'], {
    cwd: back,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
