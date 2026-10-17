import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MAINTENANCE_MESSAGE, parseFrenchDateTime } from './maintenanceWindow.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function usageError(message) {
  console.error(`[dev] ${message}`);
  process.exit(1);
}

/** Deliberately not commander here (unlike build.mjs) — this wrapper only
 * ever needs to recognize one thing, "maintenance-prepare" as the first
 * token, and must pass everything else straight through to `vite` verbatim
 * and unexamined. `npm run dev` is also how scripts/testServers.ts boots the
 * front for the functional suite, with real Vite flags (`--host`, `--port`)
 * that this file has no business knowing about — a strict option parser
 * (commander, previously) rejects anything it doesn't recognize, which broke
 * exactly that. */
function parseMaintenancePrepareArgs(rest) {
  let from = null;
  let to = null;
  let message = null;
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--from') from = rest[(i += 1)] ?? null;
    else if (token === '--to') to = rest[(i += 1)] ?? null;
    else if (token === '--message') message = rest[(i += 1)] ?? null;
    else usageError(`unknown argument "${token}"`);
  }
  if (!from || !to) usageError('maintenance-prepare requires --from and --to');
  return { from, to, message };
}

function main() {
  const argv = process.argv.slice(2);
  const extraEnv = {};
  let viteArgs = argv;

  if (argv[0] === 'maintenance-prepare') {
    const { from: fromRaw, to: toRaw, message } = parseMaintenancePrepareArgs(argv.slice(1));
    const from = parseFrenchDateTime(fromRaw, 'from', usageError);
    const to = parseFrenchDateTime(toRaw, 'to', usageError);
    if (to <= from) usageError('--to must be after --from');
    // Overrides whatever the dev env files set for these keys (there is
    // nothing to override today — see MaintenanceBanner.tsx's own comment —
    // but process.env wins over vite.config.ts's file-based merge either way
    // since that merge only fills in keys the files themselves define).
    extraEnv.VITE_MAINTENANCE_FROM = String(from);
    extraEnv.VITE_MAINTENANCE_TO = String(to);
    extraEnv.VITE_MAINTENANCE_MESSAGE = message ?? DEFAULT_MAINTENANCE_MESSAGE;
    console.log(`[dev] previewing maintenance banner window: ${fromRaw} -> ${toRaw}`);
    viteArgs = [];
  }

  const child = spawn('vite', viteArgs, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

main();
