#!/usr/bin/env node
/** @deprecated Use node scripts/tuucho-versioning.mjs */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'tuucho-versioning.mjs');
const child = spawn(process.execPath, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
