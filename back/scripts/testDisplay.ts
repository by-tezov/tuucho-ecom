import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { functionalWindowSize } from '../src-test/dev/support/functionalWindow.js';
import {
  interpretHostControlLine,
  type HostControl,
  type RunControlState,
  type RunLaneId,
} from './testRunControls.js';

const CURRENT_TEST_LINE = /^\s*\u2192\s+(.+)$/;

/**
 * The reporter line that names the test which just started.
 * The bar font has no `›`, so that separator becomes `>`.
 */
export function statusTextFromReporterLine(line: string): string | undefined {
  const match = CURRENT_TEST_LINE.exec(line);
  const raw = match?.[1];
  if (!raw) return undefined;
  const text = raw
    .replaceAll('\u203a', '>')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.slice(0, 500);
}

export type LaneProgress = {
  /** Index printed on the console line, unchanged. 0 before the first test. */
  index: number;
  /** Indexes in the order this lane started them. A retry does not add another. */
  order: string[];
  total: number;
  failed: Set<string>;
};

export function createLaneProgress(): LaneProgress {
  return { index: 0, order: [], total: 0, failed: new Set() };
}

const RUNNING_LINE = /^Running (\d+) tests?$/;
const CURRENT_INDEX_LINE = /^\s*\u2192\s+(\d+)\b/;
const RESULT_LINE = /^\s*(\u2713|\u2718)\s+(\d+)\b/;

/** Update the lane counter from one reporter line. True when the bar should repaint. */
export function applyReporterProgress(line: string, progress: LaneProgress): boolean {
  const running = RUNNING_LINE.exec(line.trim());
  if (running?.[1]) {
    progress.total = Number(running[1]);
    return true;
  }
  const current = CURRENT_INDEX_LINE.exec(line);
  if (current?.[1]) {
    progress.index = Number(current[1]);
    if (!progress.order.includes(current[1])) progress.order.push(current[1]);
    return true;
  }
  const result = RESULT_LINE.exec(line);
  const index = result?.[2];
  if (!result || !index) return false;
  if (result[1] === '\u2713') progress.failed.delete(index);
  else if (!/\(not executed\)\s*$/.test(line.trim())) progress.failed.add(index);
  return true;
}

/** `1017 - 1/2 - 0`: the printed index, which test this is in the lane, how many failed. */
export function formatLaneProgress(progress: LaneProgress): string {
  const place = progress.index === 0 ? 0 : progress.order.indexOf(String(progress.index)) + 1;
  return `${progress.index} - ${place}/${progress.total} - ${progress.failed.size}`;
}

export type TestLaneId = 'web' | 'mobile';

export type LaneDisplaySlot = {
  lane: TestLaneId;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type NestedTestDisplay = {
  /** X display for one lane, for example `:2`. A lone lane shares its display. */
  displayFor(lane: TestLaneId): string;
  /** Title-bar buttons and the throttle field. The lane is the window that sent it. */
  setControlHandler(handler: (lane: RunLaneId, control: HostControl) => void): void;
  /** Paint one title bar, or every bar when `lane` is omitted. */
  setRunState(state: RunControlState, lane?: RunLaneId): void;
  /** Show the throttle that lane is using now. */
  setThrottle(lane: RunLaneId, ms: number): void;
  /** Current test title, the same text the console prints on the arrow line. */
  setStatus(lane: RunLaneId, text: string): void;
  /** `index - current/total - failed` on the throttle row. */
  setProgress(lane: RunLaneId, text: string): void;
  /** Close one window. The other lane stays up. */
  closeLane(lane: RunLaneId): Promise<void>;
  close: () => Promise<void>;
};

const HEADED_DISPLAY_PACKAGES: Record<string, string> = {
  Xephyr: 'xserver-xephyr',
  gcc: 'gcc',
  'libx11-dev': 'libx11-dev',
};

/**
 * Where each headed lane sits on the operator's desktop. Side by side, each
 * lane has its own display so the two Chromes cannot take focus from each
 * other. A single run keeps one display.
 */
export function laneDisplayLayout(options: {
  left: number;
  top: number;
  web: boolean;
  mobile: boolean;
  sideBySide: boolean;
}): LaneDisplaySlot[] {
  const web = functionalWindowSize('web');
  const mobile = functionalWindowSize('mobile');
  if (!options.web && !options.mobile) {
    throw new Error('A nested test display needs a desktop or handset window.');
  }
  if (options.sideBySide) {
    const slots: LaneDisplaySlot[] = [];
    if (options.web) {
      slots.push({
        lane: 'web',
        left: options.left,
        top: options.top,
        width: web.width,
        height: web.windowHeight,
      });
    }
    if (options.mobile) {
      slots.push({
        lane: 'mobile',
        left: options.left + (options.web ? web.width : 0),
        top: options.top,
        width: mobile.width,
        height: mobile.windowHeight,
      });
    }
    return slots;
  }
  return [
    {
      lane: options.web ? 'web' : 'mobile',
      left: options.left,
      top: options.top,
      width: Math.max(options.web ? web.width : 0, options.mobile ? mobile.width : 0),
      height: Math.max(options.web ? web.windowHeight : 0, options.mobile ? mobile.windowHeight : 0),
    },
  ];
}

export function formatMissingHeadedDisplayTools(missing: readonly string[]): string {
  const lines = missing.map((id) => {
    const pkg = HEADED_DISPLAY_PACKAGES[id];
    return pkg && pkg !== id ? `- ${id} (package ${pkg})` : `- ${id}`;
  });
  const unchecked = missing.includes('gcc')
    ? 'X11 headers were not checked, because that check needs gcc.'
    : undefined;
  return [
    '[test] Headed tests need these tools. Install them, then run the suite again.',
    'Missing:',
    ...lines,
    ...(unchecked ? [unchecked] : []),
    'On Debian or Ubuntu: sudo apt install xserver-xephyr gcc libx11-dev',
  ].join('\n');
}

function commandOnPath(name: string): boolean {
  const path = process.env.PATH ?? '';
  for (const dir of path.split(':')) {
    if (!dir) continue;
    try {
      statSync(join(dir, name));
      return true;
    } catch {
      // Keep looking.
    }
  }
  return false;
}

function x11DevPresent(): boolean {
  const header = spawnSync('gcc', ['-x', 'c', '-fsyntax-only', '-'], {
    input: '#include <X11/Xlib.h>\n',
    encoding: 'utf8',
  });
  if (header.status !== 0) return false;
  const dir = mkdtempSync(join(tmpdir(), 'pam-x11-check-'));
  try {
    const linked = spawnSync('gcc', ['-x', 'c', '-o', join(dir, 'probe'), '-', '-lX11'], {
      input: 'int main(void){return 0;}\n',
      encoding: 'utf8',
    });
    return linked.status === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Names of headed-display tools that are not usable on this machine. */
export function missingHeadedDisplayTools(): string[] {
  const missing: string[] = [];
  if (!commandOnPath('Xephyr')) missing.push('Xephyr');
  const gcc = commandOnPath('gcc');
  if (!gcc) missing.push('gcc');
  else if (!x11DevPresent()) missing.push('libx11-dev');
  return missing;
}

export function assertHeadedDisplayTools(): void {
  const missing = missingHeadedDisplayTools();
  if (missing.length > 0) throw new Error(formatMissingHeadedDisplayTools(missing));
}

export function headedChildEnv(env: NodeJS.ProcessEnv, display: string | undefined): NodeJS.ProcessEnv {
  return display ? applyNestedDisplayEnv(env, display) : env;
}

/**
 * Point a test process at one nested display. Drop the host Wayland display
 * so Chrome cannot open a second window on the compositor the operator is using.
 */
export function applyNestedDisplayEnv(env: NodeJS.ProcessEnv, display: string): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {
    ...env,
    DISPLAY: display,
    PAM_TEST_NESTED_DISPLAY: '1',
  };
  delete next.WAYLAND_DISPLAY;
  return next;
}

function ensureHostHelper(root: string): string {
  const source = join(root, 'scripts/testDisplayHost.c');
  const binary = join(root, 'output/test/bin/test-display-host');
  mkdirSync(join(root, 'output/test/bin'), { recursive: true });
  let fresh = false;
  try {
    fresh = statSync(binary).mtimeMs >= statSync(source).mtimeMs;
  } catch {
    fresh = false;
  }
  if (fresh) return binary;
  const compiled = spawnSync('gcc', ['-O2', '-o', binary, source, '-lX11'], { encoding: 'utf8' });
  if (compiled.status !== 0) {
    const detail = (compiled.stderr || compiled.stdout || compiled.error?.message || '').trim();
    throw new Error(`[test] could not build the headed display window. ${detail}`.trim());
  }
  return binary;
}

function capture(stream: Readable | null): () => string {
  let text = '';
  stream?.setEncoding('utf8');
  stream?.on('data', (chunk: string) => {
    text = (text + chunk).slice(-4_000);
  });
  return () => text;
}

function collectLines(stream: Readable | null): {
  next: (timeoutMs: number, label: string) => Promise<string>;
  follow: (onLine: (line: string) => void) => void;
  cancel: () => void;
} {
  const queued: string[] = [];
  let buffer = '';
  let follower: ((line: string) => void) | undefined;
  let waiter: ((line: string) => void) | undefined;
  let cancelWait = (): void => undefined;
  const push = (line: string): void => {
    if (!line) return;
    if (follower) follower(line);
    else if (waiter) {
      const resolve = waiter;
      waiter = undefined;
      cancelWait = () => undefined;
      resolve(line);
    } else queued.push(line);
  };
  stream?.setEncoding('utf8');
  stream?.on('data', (chunk: string) => {
    buffer += chunk;
    let end = buffer.indexOf('\n');
    while (end >= 0) {
      push(buffer.slice(0, end).trim());
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf('\n');
    }
  });
  return {
    next(timeoutMs, label) {
      const existing = queued.shift();
      if (existing !== undefined) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter = undefined;
          cancelWait = () => undefined;
          reject(new Error(`[test] ${label} did not become ready.`));
        }, timeoutMs);
        cancelWait = () => {
          clearTimeout(timer);
          waiter = undefined;
        };
        waiter = (line) => {
          clearTimeout(timer);
          cancelWait = () => undefined;
          resolve(line);
        };
      });
    },
    follow(onLine) {
      follower = onLine;
      for (const line of queued.splice(0)) onLine(line);
    },
    cancel() {
      cancelWait();
    },
  };
}

function readLine(
  stream: Readable | null,
  timeoutMs: number,
  label: string,
): { promise: Promise<string>; cancel: () => void } {
  let cancel = () => undefined;
  const promise = new Promise<string>((resolve, reject) => {
    if (!stream) {
      reject(new Error(`[test] ${label} produced no output.`));
      return;
    }
    let buffer = '';
    let settled = false;
    const finish = (value: string | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.off('data', onData);
      if (value instanceof Error) reject(value);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      finish(new Error(`[test] ${label} did not become ready.`));
    }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      finish(buffer.slice(0, end).trim());
    };
    cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.off('data', onData);
    };
    stream.on('data', onData);
  });
  return { promise, cancel };
}

function stopProcess(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const pid = child.pid;
      if (pid !== undefined) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          try {
            child.kill('SIGKILL');
          } catch {
            // Already gone.
          }
        }
      }
      resolve();
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function launchXephyr(windowId: string, width: number, height: number): ChildProcess {
  // No -glamor: a failed GPU init leaves the test window blank. Software
  // drawing still shows Chrome, and focus stays inside this server.
  const args = ['-displayfd', '1', '-ac', '-noreset', '-parent', windowId, '-screen', `${width}x${height}`];
  return spawn('Xephyr', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
}

async function openLaneDisplay(
  helper: string,
  screen: LaneDisplaySlot,
  register: (close: () => Promise<void>) => void,
  hostInputs: Map<TestLaneId, Writable>,
  throttleMs: number,
  onControl: (lane: RunLaneId, control: HostControl) => void,
): Promise<string> {
  const host = spawn(
    helper,
    [
      String(screen.left),
      String(screen.top),
      String(screen.width),
      String(screen.height),
      screen.lane === 'mobile' ? 'Lumen tests (handset)' : 'Lumen tests (web)',
      String(throttleMs),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], detached: true },
  );
  host.stdin?.on('error', () => undefined);
  if (host.stdin) hostInputs.set(screen.lane, host.stdin);
  const hostErrors = capture(host.stderr);
  const hostLines = collectLines(host.stdout);
  let xephyr: ChildProcess | undefined;
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (xephyr) stopProcess(xephyr);
    if (xephyr) await waitForExit(xephyr, 2_000);
    host.stdin?.end();
    stopProcess(host);
    await waitForExit(host, 2_000);
  };
  register(close);

  try {
    const windowId = await new Promise<string>((resolve, reject) => {
      host.on('error', (error: NodeJS.ErrnoException) => {
        hostLines.cancel();
        reject(new Error(`[test] ${screen.lane} display window failed to start. ${error.message}`));
      });
      const onExit = () => {
        hostLines.cancel();
        reject(new Error(`[test] ${screen.lane} display window exited. ${hostErrors()}`.trim()));
      };
      host.once('exit', onExit);
      hostLines.next(5_000, `${screen.lane} display window`).then(
        (line) => {
          host.off('exit', onExit);
          resolve(line);
        },
        (error: unknown) => {
          host.off('exit', onExit);
          reject(error);
        },
      );
    });
    hostLines.follow((line) => {
      const control = interpretHostControlLine(line);
      if (control) onControl(screen.lane, control);
    });
    if (!/^\d+$/.test(windowId)) {
      throw new Error(`[test] ${screen.lane} display window returned an unexpected id (${windowId}).`);
    }

    const candidate = launchXephyr(windowId, screen.width, screen.height);
    xephyr = candidate;
    const xephyrErrors = capture(candidate.stderr);
    const displayLine = readLine(candidate.stdout, 8_000, `${screen.lane} nested display`);
    const ready = await new Promise<{ line: string; exited: boolean }>((resolve, reject) => {
      candidate.on('error', (error: NodeJS.ErrnoException) => {
        displayLine.cancel();
        const missing = error.code === 'ENOENT' ? ' Install xserver-xephyr.' : '';
        reject(new Error(`[test] ${screen.lane} nested display failed to start.${missing} ${error.message}`));
      });
      const onExit = () => {
        displayLine.cancel();
        resolve({ line: '', exited: true });
      };
      candidate.once('exit', onExit);
      displayLine.promise.then(
        (line) => {
          candidate.off('exit', onExit);
          resolve({ line, exited: false });
        },
        (error: unknown) => {
          candidate.off('exit', onExit);
          reject(error);
        },
      );
    });
    if (ready.exited || !/^\d+$/.test(ready.line) || candidate.exitCode !== null || candidate.signalCode !== null) {
      throw new Error(`[test] ${screen.lane} nested display failed to start. ${xephyrErrors()}`.trim());
    }
    return `:${ready.line}`;
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * One nested X server per concurrent lane. Each host window draws its own
 * title bar (Pause, Restart, Stop, a throttle field, and the drag handle)
 * and stays in normal stacking, so other windows can cover it. It does not
 * take the keyboard when it opens. Separate servers keep web and mobile
 * from taking focus from each other. Each window controls only its lane.
 */
export async function startNestedTestDisplays(options: {
  root: string;
  screens: readonly LaneDisplaySlot[];
  throttleMs: number;
  /** Registered once the first host process exists, so an interrupt can close it. */
  onOpen?: (close: () => Promise<void>) => void;
}): Promise<NestedTestDisplay> {
  if (options.screens.length === 0) throw new Error('[test] the nested display size is empty.');
  for (const screen of options.screens) {
    if (screen.width < 1 || screen.height < 1) throw new Error('[test] the nested display size is empty.');
  }
  assertHeadedDisplayTools();
  const helper = ensureHostHelper(options.root);
  const closers = new Map<TestLaneId, () => Promise<void>>();
  const hostInputs = new Map<TestLaneId, Writable>();
  const pendingControls: Array<{ lane: RunLaneId; control: HostControl }> = [];
  let controlHandler: ((lane: RunLaneId, control: HostControl) => void) | undefined;
  const emitControl = (lane: RunLaneId, control: HostControl): void => {
    if (controlHandler) controlHandler(lane, control);
    else pendingControls.push({ lane, control });
  };
  const writeHost = (lane: RunLaneId | undefined, line: string): void => {
    const targets = lane ? [hostInputs.get(lane)] : [...hostInputs.values()];
    for (const input of targets) {
      try {
        input?.write(line);
      } catch {
        // The window can close while a button is handled.
      }
    }
  };
  const byLane = new Map<TestLaneId, string>();
  let closed = false;
  const closeLane = async (lane: RunLaneId): Promise<void> => {
    const closer = closers.get(lane);
    if (!closer) return;
    closers.delete(lane);
    hostInputs.delete(lane);
    await closer();
  };
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    for (const lane of [...closers.keys()].reverse()) await closeLane(lane);
  };
  options.onOpen?.(close);

  try {
    for (const screen of options.screens) {
      byLane.set(
        screen.lane,
        await openLaneDisplay(
          helper,
          screen,
          (closer) => {
            closers.set(screen.lane, closer);
          },
          hostInputs,
          options.throttleMs,
          emitControl,
        ),
      );
    }
    const where = options.screens
      .map((screen) => `${screen.lane} ${screen.left},${screen.top} (${screen.width}x${screen.height})`)
      .join('; ');
    console.error(
      `[test] headed browsers use separate displays: ${where}. Each window pauses, restarts, and stops only its own lane. The throttle field does the same. Drag the title. Other windows can cover it. The keyboard stays in your windows.`,
    );
    return {
      displayFor(lane) {
        const exact = byLane.get(lane);
        if (exact) return exact;
        if (byLane.size === 1) return [...byLane.values()][0]!;
        throw new Error(`[test] no nested display for the ${lane} lane.`);
      },
      setControlHandler(handler) {
        controlHandler = handler;
        for (const pending of pendingControls.splice(0)) handler(pending.lane, pending.control);
      },
      setRunState(state, lane) {
        writeHost(lane, `${state}\n`);
      },
      setThrottle(lane, ms) {
        writeHost(lane, `throttle ${ms}\n`);
      },
      setStatus(lane, text) {
        const safe = text.replace(/[\r\n]/g, ' ').trim();
        if (safe) writeHost(lane, `status ${safe}\n`);
      },
      setProgress(lane, text) {
        if (/^\d+ - \d+\/\d+ - \d+$/.test(text)) writeHost(lane, `progress ${text}\n`);
      },
      closeLane,
      close,
    };
  } catch (error) {
    await close();
    if (error instanceof Error && error.message.startsWith('[test]')) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[test] nested display failed to start. ${detail}`.trim());
  }
}
