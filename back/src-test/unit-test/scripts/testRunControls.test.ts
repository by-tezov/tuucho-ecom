import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  continuePids,
  interpretHostControlLine,
  interpretRunControlKey,
  isPausableTestProcess,
  pausablePidsInGroup,
  pausePids,
  processGroupFromStat,
} from '../../../scripts/testRunControls.js';

function stateOf(pid: number): string | undefined {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const end = stat.lastIndexOf(')');
  return end < 0 ? undefined : stat.slice(end + 2).split(' ')[0];
}

async function waitForState(pid: number, expected: 'T' | 'running'): Promise<string | undefined> {
  const deadline = Date.now() + 1_000;
  let state = stateOf(pid);
  while (Date.now() < deadline) {
    state = stateOf(pid);
    if (expected === 'T' ? state === 'T' : state !== 'T') return state;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return state;
}

test('title-bar lines: pause, restart, quit, and a throttle value', () => {
  assert.deepEqual(interpretHostControlLine('pause'), { type: 'run', action: 'pause' });
  assert.deepEqual(interpretHostControlLine('restart'), { type: 'run', action: 'restart' });
  assert.deepEqual(interpretHostControlLine('quit'), { type: 'run', action: 'quit' });
  assert.deepEqual(interpretHostControlLine('throttle 400'), { type: 'throttle', ms: 400 });
  assert.deepEqual(interpretHostControlLine('throttle 0'), { type: 'throttle', ms: 0 });
  assert.deepEqual(interpretHostControlLine('throttle 99999'), { type: 'throttle', ms: 60_000 });
  assert.equal(interpretHostControlLine('stop'), undefined);
  assert.equal(interpretHostControlLine('paused'), undefined);
  assert.equal(interpretHostControlLine('throttle'), undefined);
  assert.equal(interpretHostControlLine('throttle slow'), undefined);
});

test('run keys: p pauses, r and c restart, q and Ctrl-C quit', () => {
  assert.equal(interpretRunControlKey('p'), 'pause');
  assert.equal(interpretRunControlKey('P'), 'pause');
  assert.equal(interpretRunControlKey('r'), 'restart');
  assert.equal(interpretRunControlKey('c'), 'restart');
  assert.equal(interpretRunControlKey('q'), 'quit');
  assert.equal(interpretRunControlKey('\u0003'), 'quit');
  assert.equal(interpretRunControlKey('x'), undefined);
});

test('process group is the field after the parent pid, even when comm contains parentheses', () => {
  assert.equal(processGroupFromStat('123 (sleep) S 1 99 99 0'), 99);
  assert.equal(processGroupFromStat('123 (foo) bar) S 1 77 77'), 77);
  assert.equal(processGroupFromStat('no-paren'), undefined);
});

test('the test runner pauses and Chrome does not', () => {
  assert.equal(isPausableTestProcess('node /app/node_modules/patchright/cli.js test'), true);
  assert.equal(isPausableTestProcess('/usr/bin/npx patchright test'), true);
  assert.equal(isPausableTestProcess('/opt/google/chrome/chrome --user-data-dir=/tmp/profile'), false);
  assert.equal(isPausableTestProcess('chrome_crashpad_handler'), false);
  assert.equal(isPausableTestProcess('/bin/sleep 30'), false);
});

test('pause freezes a detached node process and restart lets it run', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  const pid = child.pid;
  assert.ok(pid);
  child.unref();
  try {
    const pids = pausablePidsInGroup(pid);
    assert.ok(pids.includes(pid));
    pausePids(pids);
    assert.equal(await waitForState(pid, 'T'), 'T');
    continuePids(pids);
    const resumed = await waitForState(pid, 'running');
    assert.notEqual(resumed, 'T');
  } finally {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
});
