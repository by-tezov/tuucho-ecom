#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [
  spawn('npm', ['run', 'dev'], { cwd: join(root, 'kernel/back'), stdio: 'inherit', env: process.env }),
  spawn('npm', ['run', 'dev', '--', '--port', '5174', '--strictPort'], {
    cwd: join(root, 'kernel/front'),
    stdio: 'inherit',
    env: process.env,
  }),
];
for (const child of children) {
  child.on('exit', (code) => {
    for (const other of children) other.kill();
    process.exit(code ?? 1);
  });
}
process.on('SIGINT', () => {
  for (const child of children) child.kill();
});
