#!/usr/bin/env node
/**
 * Client-only Vite build + per-asset size gate.
 *
 * Vite's soft warning fires when any JS/CSS asset exceeds 500 kB after minify.
 * This script makes that a hard fail for every asset (same ceiling). Do not
 * "fix" overruns with catch-all manualChunks (see vite.config.ts): measure
 * the entry static graph first and move non-critical UI behind lazy().
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.bundle-check');
const assetsDir = join(outDir, 'assets');

/** Soft Vite threshold (bytes after minify). Same number Vite uses for its
 * chunk-size reporter — keep the hard gate aligned so deploy builds stay quiet. */
const DEFAULT_MAX_BYTES = 500_000;

function maxFor() {
  return DEFAULT_MAX_BYTES;
}

function formatKb(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

rmSync(outDir, { recursive: true, force: true });

try {
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/vite/bin/vite.js'),
      'build',
      '--outDir',
      outDir,
      // Empty outDir ourselves; Vite would refuse a dirty path otherwise.
      '--emptyOutDir',
    ],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    },
  );
} catch (error) {
  const stderr = error.stderr?.toString?.() ?? '';
  const stdout = error.stdout?.toString?.() ?? '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  console.error('[check:bundle] vite build failed.');
  process.exit(1);
}

if (!existsSync(assetsDir)) {
  console.error(`[check:bundle] missing assets dir: ${relative(root, assetsDir)}`);
  process.exit(1);
}

const offenders = [];
const scanned = [];

for (const name of readdirSync(assetsDir)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const path = join(assetsDir, name);
  const size = statSync(path).size;
  const limit = maxFor();
  scanned.push({ name, size, limit });
  if (size > limit) offenders.push({ name, size, limit });
}

scanned.sort((a, b) => b.size - a.size);

if (offenders.length > 0) {
  console.error(`[check:bundle] ${offenders.length} asset(s) over their size ceiling:`);
  for (const { name, size, limit } of offenders.sort((a, b) => b.size - a.size)) {
    console.error(`  - ${name}: ${formatKb(size)} (max ${formatKb(limit)})`);
  }
  console.error(
    '[check:bundle] Prefer moving work off the entry static import graph (lazy routes / dynamic import). Do not reintroduce catch-all manualChunks — see vite.config.ts.',
  );
  process.exitCode = 1;
} else {
  const largest = scanned[0];
  console.log(
    `[check:bundle] ok (${scanned.length} js/css assets; largest ${largest.name} ${formatKb(largest.size)})`,
  );
}

rmSync(outDir, { recursive: true, force: true });
