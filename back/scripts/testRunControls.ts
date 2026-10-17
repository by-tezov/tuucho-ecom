/**
 * Keys for a running Patchright suite. The parent keeps the terminal and
 * freezes the test processes, leaving Chrome on screen.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { clampThrottleMs } from './throttleValue.js';

export type RunControlAction = 'pause' | 'restart' | 'quit';

/** `r` and `c` both continue a paused run from the frozen moment. */
export function interpretRunControlKey(key: string): RunControlAction | undefined {
  if (key === 'p' || key === 'P') return 'pause';
  if (key === 'r' || key === 'R' || key === 'c' || key === 'C') return 'restart';
  if (key === 'q' || key === 'Q' || key === '\u0003') return 'quit';
  return undefined;
}

export type RunLaneId = 'web' | 'mobile';

export type HostControl = { type: 'run'; action: RunControlAction } | { type: 'throttle'; ms: number };

/** Lines one test window writes. The caller already knows which window it was. */
export function interpretHostControlLine(line: string): HostControl | undefined {
  if (line === 'pause' || line === 'restart' || line === 'quit') return { type: 'run', action: line };
  if (line.startsWith('throttle ')) {
    const ms = clampThrottleMs(line.slice('throttle '.length));
    if (ms !== undefined) return { type: 'throttle', ms };
  }
  return undefined;
}

/** Field 5 of `/proc/<pid>/stat` (process group), after the comm in parentheses. */
export function processGroupFromStat(stat: string): number | undefined {
  const end = stat.lastIndexOf(')');
  if (end < 0) return undefined;
  const pgrp = Number(stat.slice(end + 2).split(' ')[2]);
  return Number.isFinite(pgrp) ? pgrp : undefined;
}

/** Node and the test runner freeze. The browser stays up so the page can be looked at. */
export function isPausableTestProcess(cmdline: string): boolean {
  const text = cmdline.toLowerCase();
  if (text.includes('chrome') || text.includes('chromium')) return false;
  return text.includes('node') || text.includes('patchright') || text.includes('npx');
}

interface ProcEntry {
  pid: number;
  ppid: number;
  pgrp: number;
  cmdline: string;
}

function listProcesses(): ProcEntry[] {
  let names: string[];
  try {
    names = readdirSync('/proc');
  } catch {
    return [];
  }
  const entries: ProcEntry[] = [];
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    let stat: string;
    let cmdline: string;
    try {
      stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      cmdline = readFileSync(`/proc/${pid}/cmdline`).toString('utf8').replaceAll('\0', ' ').trim();
    } catch {
      continue;
    }
    const end = stat.lastIndexOf(')');
    if (end < 0) continue;
    const fields = stat.slice(end + 2).split(' ');
    const ppid = Number(fields[1]);
    const pgrp = Number(fields[2]);
    if (!Number.isFinite(ppid) || !Number.isFinite(pgrp)) continue;
    entries.push({ pid, ppid, pgrp, cmdline });
  }
  return entries;
}

/** Test-runner pids in this group, plus their node descendants. Chrome stays out. */
export function pausablePidsInGroup(groupPid: number): number[] {
  const entries = listProcesses();
  const byPid = new Map(entries.map((entry) => [entry.pid, entry]));
  const children = new Map<number, number[]>();
  for (const entry of entries) {
    const kids = children.get(entry.ppid) ?? [];
    kids.push(entry.pid);
    children.set(entry.ppid, kids);
  }
  const seeds = entries.filter((entry) => entry.pgrp === groupPid).map((entry) => entry.pid);
  const seen = new Set<number>();
  const stack = [...seeds];
  const pids: number[] = [];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (pid === undefined || seen.has(pid) || pid === process.pid) continue;
    seen.add(pid);
    for (const child of children.get(pid) ?? []) stack.push(child);
    const entry = byPid.get(pid);
    if (entry && isPausableTestProcess(entry.cmdline)) pids.push(pid);
  }
  return pids;
}

function signalPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // The process can exit between the listing and the signal.
  }
}

export function pausePids(pids: number[]): void {
  for (const pid of pids) signalPid(pid, 'SIGSTOP');
}

export function continuePids(pids: number[]): void {
  for (const pid of pids) signalPid(pid, 'SIGCONT');
}

export type RunControlState = 'paused' | 'running';

export interface FunctionalRunControls {
  /** Keyboard: every lane. */
  apply: (action: RunControlAction) => void;
  /** Title bar: one window. */
  applyLane: (lane: RunLaneId, action: RunControlAction) => void;
  close: () => void;
}

function laneName(lane: RunLaneId): string {
  return lane === 'mobile' ? 'handset' : 'web';
}

/**
 * Listen for `p`, `r`, and `q` while Patchright is running.
 * No-op when stdin is not a terminal (CI, a pipe).
 * `onQuit` is the same cleanup path as Ctrl-C. Call `close` when the run ends
 * so the terminal is cooked again.
 */
export function attachFunctionalRunControls(options: {
  groupPids: () => number[];
  /** Process groups for one window. Absent groups mean that lane is not running. */
  laneGroupPids?: (lane: RunLaneId) => number[];
  onQuit: () => void;
  /** End one lane. The other lane keeps running. Falls back to `onQuit` when omitted. */
  onQuitLane?: (lane: RunLaneId) => void;
  /** Painted on the title bar. Omit `lane` to paint every window. */
  onState?: (state: RunControlState, lane?: RunLaneId) => void;
}): FunctionalRunControls {
  const stdin = process.stdin;
  const pausedLanes = new Map<RunLaneId, number[]>();
  let closed = false;
  const lanes: RunLaneId[] = ['web', 'mobile'];

  const groupsFor = (lane: RunLaneId): number[] => options.laneGroupPids?.(lane) ?? [];

  const activeLanes = (): RunLaneId[] => {
    const running = lanes.filter((lane) => groupsFor(lane).length > 0 || pausedLanes.has(lane));
    return running.length > 0 ? running : lanes;
  };

  const pidsFor = (groups: number[]): number[] => [
    ...new Set(groups.flatMap((groupPid) => pausablePidsInGroup(groupPid))),
  ];

  const pauseLanes = (targets: RunLaneId[], label: string): void => {
    const fresh = targets.filter((lane) => !pausedLanes.has(lane));
    if (fresh.length === 0) {
      console.error(`[test] ${label} already paused. r restarts, q quits.`);
      return;
    }
    let any = false;
    for (const lane of fresh) {
      const held = new Set([...pausedLanes.values()].flat());
      const pids = pidsFor(groupsFor(lane)).filter((pid) => !held.has(pid));
      if (pids.length === 0) continue;
      pausePids(pids);
      pausedLanes.set(lane, pids);
      options.onState?.('paused', lane);
      any = true;
    }
    if (!any) {
      console.error('[test] nothing to pause.');
      return;
    }
    console.error(`[test] ${label} paused. The browser stays where it is. r restarts, q quits.`);
  };

  const restartLanes = (targets: RunLaneId[], quiet: boolean, label: string): void => {
    const active = targets.filter((lane) => pausedLanes.has(lane));
    if (active.length === 0) {
      if (!quiet) console.error(`[test] ${label} already running.`);
      return;
    }
    for (const lane of active) {
      continuePids(pausedLanes.get(lane) ?? []);
      pausedLanes.delete(lane);
      options.onState?.('running', lane);
    }
    if (!quiet) console.error(`[test] ${label} restarted.`);
  };

  const pause = (targets: RunLaneId[], label: string): void => {
    if (options.laneGroupPids) pauseLanes(targets, label);
    else pauseGroups(label);
  };

  const pausedGroups: number[] = [];
  let groupsPaused = false;
  const pauseGroups = (label: string): void => {
    if (groupsPaused) {
      console.error(`[test] ${label} already paused. r restarts, q quits.`);
      return;
    }
    const pids = pidsFor(options.groupPids());
    if (pids.length === 0) {
      console.error('[test] nothing to pause.');
      return;
    }
    pausePids(pids);
    pausedGroups.splice(0, pausedGroups.length, ...pids);
    groupsPaused = true;
    options.onState?.('paused');
    console.error(`[test] ${label} paused. The browser stays where it is. r restarts, q quits.`);
  };

  const restartGroups = (quiet: boolean, label: string): void => {
    if (!groupsPaused) {
      if (!quiet) console.error(`[test] ${label} already running.`);
      return;
    }
    continuePids(pausedGroups);
    pausedGroups.length = 0;
    groupsPaused = false;
    options.onState?.('running');
    if (!quiet) console.error(`[test] ${label} restarted.`);
  };

  const applyTargets = (action: RunControlAction, targets: RunLaneId[], label: string, lane?: RunLaneId): void => {
    if (closed) return;
    if (action === 'pause') pause(targets, label);
    else if (action === 'restart') {
      if (options.laneGroupPids) restartLanes(targets, false, label);
      else restartGroups(false, label);
    } else if (lane && options.onQuitLane) {
      options.onQuitLane(lane);
      if (pausedLanes.has(lane)) {
        continuePids(pausedLanes.get(lane) ?? []);
        pausedLanes.delete(lane);
      }
    } else {
      if (options.laneGroupPids) restartLanes(lanes, true, label);
      else restartGroups(true, label);
      options.onQuit();
    }
  };

  const apply = (action: RunControlAction): void => {
    applyTargets(action, activeLanes(), 'the run');
  };

  const applyLane = (lane: RunLaneId, action: RunControlAction): void => {
    applyTargets(action, [lane], laneName(lane), lane);
  };

  const onData = (chunk: string): void => {
    if (closed) return;
    for (const key of chunk) {
      const action = interpretRunControlKey(key);
      if (action) apply(action);
    }
  };

  if (stdin.isTTY) {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    console.error('[test] keys: p pause, r restart, q quit. Ctrl-C still quits.');
  }

  return {
    apply,
    applyLane,
    close: () => {
      if (closed) return;
      closed = true;
      stdin.off('data', onData);
      if (options.laneGroupPids) restartLanes(lanes, true, 'the run');
      else restartGroups(true, 'the run');
      if (stdin.isTTY) stdin.setRawMode(false);
    },
  };
}
