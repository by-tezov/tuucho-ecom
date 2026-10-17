import { existsSync, lstatSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from 'patchright/test';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Absolute profile path markers Chrome puts on its command line. */
function profileNeedles(profileDir: string): string[] {
  const normalized = profileDir.replace(/\/+$/, '');
  return [normalized, `--user-data-dir=${normalized}`, `--user-data-dir=${profileDir}`];
}

function isChromeFamilyCmdline(cmdline: string): boolean {
  const flat = cmdline.replaceAll('\0', ' ');
  return /\b(google-chrome|chrome|chromium|crashpad_handler)\b/i.test(flat);
}

/**
 * PIDs whose cmdline references this suite's user-data-dir. Scoped to the
 * dedicated test profile so a developer's everyday Chrome is never touched.
 */
export function listChromePidsForProfile(profileDir: string): number[] {
  const needles = profileNeedles(profileDir);
  const pids: number[] = [];
  let entries: string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return pids;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let cmdline: string;
    try {
      cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf8');
    } catch {
      continue;
    }
    if (!cmdline || !isChromeFamilyCmdline(cmdline)) continue;
    if (!needles.some((needle) => cmdline.includes(needle))) continue;
    pids.push(Number(entry));
  }
  return pids;
}

export function killChromeForProfile(
  profileDir: string,
  signal: NodeJS.Signals = 'SIGTERM',
): number {
  const pids = listChromePidsForProfile(profileDir);
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // Already exited.
    }
  }
  return pids.length;
}

/** Drop Chrome singleton lock files left after an abrupt browser death. */
export function clearStaleProfileLocks(profileDir: string): void {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const path = join(profileDir, name);
    try {
      if (!existsSync(path)) continue;
      unlinkSync(path);
    } catch {
      // Profile may be in use by a still-dying process; caller retries kill.
    }
  }
}

/**
 * Force the profile to look like a clean exit so the next launch does not
 * show "Restore pages / Chrome didn't shut down correctly".
 */
export async function markProfileCleanExit(profileDir: string): Promise<void> {
  const preferencesPath = join(profileDir, 'Default', 'Preferences');
  try {
    if (!existsSync(preferencesPath)) return;
    const preferences = JSON.parse(readFileSync(preferencesPath, 'utf8')) as Record<string, unknown>;
    const profile =
      preferences.profile && typeof preferences.profile === 'object'
        ? (preferences.profile as Record<string, unknown>)
        : {};
    profile.exit_type = 'Normal';
    profile.exited_cleanly = true;
    preferences.profile = profile;
    preferences.exit_type = 'Normal';
    writeFileSync(preferencesPath, JSON.stringify(preferences), 'utf8');
  } catch {
    // Best-effort; launch args also hide the bubble.
  }
}

async function waitForChromeExit(profileDir: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (listChromePidsForProfile(profileDir).length === 0) return true;
    await sleep(100);
  }
  return listChromePidsForProfile(profileDir).length === 0;
}

/**
 * Before launching: only clear stale locks. Do not SIGKILL a live profile
 * Chrome here — pamsurin-tiers-shop never does that on open; hard-killing
 * channel:chrome mid-flight is what leaves this machine's path to the
 * remote host in a bad state until reboot.
 */
export async function ensureProfileIdle(profileDir: string): Promise<void> {
  if (listChromePidsForProfile(profileDir).length === 0) {
    clearStaleProfileLocks(profileDir);
    return;
  }
  // Ask politely; never SIGKILL on init.
  killChromeForProfile(profileDir, 'SIGTERM');
  await waitForChromeExit(profileDir, 8_000);
  clearStaleProfileLocks(profileDir);
}

/**
 * Same release model as pamsurin-tiers-shop `closeSession`: await
 * context.close() and give Chrome time to exit. Only SIGTERM leftovers;
 * never SIGKILL — that is the aggressive path the Vinted long-runs avoid.
 */
export async function closePersistentContextSafely(
  context: BrowserContext,
  profileDir: string,
): Promise<void> {
  try {
    await context.close();
  } catch {
    // Context may already be closed after a runner interrupt.
  }

  if (await waitForChromeExit(profileDir, 10_000)) {
    clearStaleProfileLocks(profileDir);
    return;
  }

  killChromeForProfile(profileDir, 'SIGTERM');
  await waitForChromeExit(profileDir, 5_000);
  clearStaleProfileLocks(profileDir);
}

/** Suite-end sweeper: SIGTERM only, matching tiers-shop's gentle close. */
export async function sweepTestBrowserProfile(profileDir: string): Promise<number> {
  if (!profileDir) return 0;
  try {
    if (!existsSync(profileDir) || !lstatSync(profileDir).isDirectory()) return 0;
  } catch {
    return 0;
  }
  const before = listChromePidsForProfile(profileDir).length;
  if (before === 0) {
    clearStaleProfileLocks(profileDir);
    return 0;
  }
  killChromeForProfile(profileDir, 'SIGTERM');
  await waitForChromeExit(profileDir, 8_000);
  clearStaleProfileLocks(profileDir);
  return before;
}
