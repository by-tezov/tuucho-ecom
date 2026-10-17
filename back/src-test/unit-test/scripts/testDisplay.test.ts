import assert from 'node:assert/strict';
import { test } from 'node:test';
import { functionalWindowSize } from '../../../src-test/dev/support/functionalWindow.js';
import {
  applyNestedDisplayEnv,
  formatMissingHeadedDisplayTools,
  applyReporterProgress,
  createLaneProgress,
  formatLaneProgress,
  laneDisplayLayout,
  statusTextFromReporterLine,
} from '../../../scripts/testDisplay.js';

test('side-by-side lanes each get their own display, handset to the right', () => {
  const web = functionalWindowSize('web');
  const mobile = functionalWindowSize('mobile');
  assert.deepEqual(laneDisplayLayout({ left: 1920, top: 0, web: true, mobile: true, sideBySide: true }), [
    { lane: 'web', left: 1920, top: 0, width: web.width, height: web.windowHeight },
    { lane: 'mobile', left: 1920 + web.width, top: 0, width: mobile.width, height: mobile.windowHeight },
  ]);
});

test('a single lane keeps one window at the requested origin', () => {
  const mobile = functionalWindowSize('mobile');
  assert.deepEqual(laneDisplayLayout({ left: 0, top: 40, web: false, mobile: true, sideBySide: false }), [
    { lane: 'mobile', left: 0, top: 40, width: mobile.width, height: mobile.windowHeight },
  ]);
});

test('a missing headed-display tool names the package and the install command', () => {
  const message = formatMissingHeadedDisplayTools(['Xephyr', 'gcc']);
  assert.match(message, /Headed tests need these tools/);
  assert.match(message, /Xephyr \(package xserver-xephyr\)/);
  assert.match(message, /- gcc/);
  assert.match(message, /X11 headers were not checked/);
  assert.match(message, /sudo apt install xserver-xephyr gcc libx11-dev/);
});

test('the current-test console line becomes the title-bar status', () => {
  const line =
    '  →  1002 Mobile checkout: customer journeys › mobile connected customer: address, gallery, card order, and Commandes all complete';
  assert.equal(
    statusTextFromReporterLine(line),
    '1002 Mobile checkout: customer journeys > mobile connected customer: address, gallery, card order, and Commandes all complete',
  );
  assert.equal(statusTextFromReporterLine('      ACTION  Navigate to "/"'), undefined);
  assert.equal(statusTextFromReporterLine('Running 4 tests'), undefined);
});

test('the lane counter is index - current/total - failed, with the index unchanged', () => {
  const handset = createLaneProgress();
  assert.equal(applyReporterProgress('Running 2 tests', handset), true);
  assert.equal(formatLaneProgress(handset), '0 - 0/2 - 0');
  assert.equal(applyReporterProgress('  →  1017 Mobile checkout: customer journeys › pay', handset), true);
  assert.equal(formatLaneProgress(handset), '1017 - 1/2 - 0');
  assert.equal(applyReporterProgress('  →  1052 Mobile checkout: customer journeys › card', handset), true);
  assert.equal(formatLaneProgress(handset), '1052 - 2/2 - 0');
  assert.equal(applyReporterProgress('  ✘  1052 Mobile checkout (4.0s)', handset), true);
  assert.equal(formatLaneProgress(handset), '1052 - 2/2 - 1');
  assert.equal(applyReporterProgress('  →  1052 Mobile checkout: customer journeys › card', handset), true);
  assert.equal(formatLaneProgress(handset), '1052 - 2/2 - 1');
  assert.equal(applyReporterProgress('  ✓  1052 Mobile checkout (1.2s)', handset), true);
  assert.equal(formatLaneProgress(handset), '1052 - 2/2 - 0');
  assert.equal(applyReporterProgress('  ✘  1017 Mobile checkout (not executed)', handset), true);
  assert.equal(formatLaneProgress(handset), '1052 - 2/2 - 0');

  const web = createLaneProgress();
  applyReporterProgress('Running 80 tests', web);
  applyReporterProgress('  →  56 Compose order flows › guest pay', web);
  applyReporterProgress('  ✘  56 Compose order flows (3.0s)', web);
  applyReporterProgress('  ✘  56 Compose order flows (3.1s)', web);
  assert.equal(formatLaneProgress(web), '56 - 1/80 - 1');
  assert.equal(applyReporterProgress('      ACTION  Navigate to "/"', web), false);
});

test('the test process leaves the host Wayland display', () => {
  const env = applyNestedDisplayEnv(
    { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', PAM_TEST_WINDOW_POSITION: '1920,0' },
    ':2',
  );
  assert.equal(env.DISPLAY, ':2');
  assert.equal(env.PAM_TEST_NESTED_DISPLAY, '1');
  assert.equal(env.PAM_TEST_WINDOW_POSITION, '1920,0');
  assert.equal('WAYLAND_DISPLAY' in env, false);
});
