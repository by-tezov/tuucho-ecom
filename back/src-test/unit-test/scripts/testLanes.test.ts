import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FUNCTIONAL_WEB_WINDOW } from '../../../src-test/dev/support/functionalWindow.js';
import {
  indexesForLane,
  laneWindowPosition,
  mergeLaneSummaries,
  planSideBySideLanes,
  resolveSideBySideFrontPorts,
  titlesForLane,
} from '../../../scripts/testLanes.js';

test('both viewports plan two environments', () => {
  const lanes = planSideBySideLanes(['functional-web', 'functional-handset'], {
    web: 4173,
    mobile: 4174,
  });
  assert.deepEqual(lanes, [
    { id: 'web', projects: ['functional-web'], frontPort: 4173, includeHandset: false },
    { id: 'mobile', projects: ['functional-handset'], frontPort: 4174, includeHandset: true },
  ]);
});

test('api stays a single environment, the same as one viewport', () => {
  assert.equal(
    planSideBySideLanes(['functional-web', 'functional-handset', 'api'], { web: 4173, mobile: 4174 }),
    null,
  );
  assert.equal(planSideBySideLanes(['functional-web'], { web: 4173, mobile: 4174 }), null);
  assert.equal(planSideBySideLanes(['api'], { web: 4173, mobile: 4174 }), null);
});

test('shop ports must differ', () => {
  assert.throws(
    () => resolveSideBySideFrontPorts({ PAM_TEST_WEB_FRONT_PORT: '4173', PAM_TEST_MOBILE_FRONT_PORT: '4173' }),
    /must differ/,
  );
  assert.deepEqual(resolveSideBySideFrontPorts({}), { web: 4173, mobile: 4174 });
});

test('lane filters keep desktop indexes below 1001 and the word mobile on the handset', () => {
  assert.deepEqual(indexesForLane([12, 1004, 40], 'web'), [12, 40]);
  assert.deepEqual(indexesForLane([12, 1004, 40], 'mobile'), [1004]);
  assert.deepEqual(
    titlesForLane(
      [
        'Functional account › profile name and phone: an empty name shows a field error',
        'mobile account appearance: dark, light, and the live system theme can each be selected',
      ],
      'mobile',
    ),
    ['mobile account appearance: dark, light, and the live system theme can each be selected'],
  );
});

test('headed mobile window starts just to the right of the desktop window', () => {
  const width = FUNCTIONAL_WEB_WINDOW.width;
  assert.equal(laneWindowPosition('web', undefined, width), '0,0');
  assert.equal(laneWindowPosition('mobile', undefined, width), `${width},0`);
  assert.equal(laneWindowPosition('mobile', '1920,0', width), `${1920 + width},0`);
});

test('merged summary lists both lanes once', () => {
  const text = mergeLaneSummaries(
    [
      {
        status: 'failed',
        passed: 2,
        total: 3,
        failed: ['12'],
        notExecuted: [],
        titles: { '12': 'web checkout: the order is paid' },
      },
      {
        status: 'passed',
        passed: 4,
        total: 4,
        failed: [],
        notExecuted: [],
        titles: { '1004': 'mobile checkout: the order is paid' },
      },
    ],
    65_000,
    'npm run test -- --dev --functional',
  );
  assert.match(text, /Tests passed: 6\/7/);
  assert.match(text, /12  web checkout: the order is paid/);
  assert.match(text, /--index "12"/);
  assert.match(text, /Not executed tests: none/);
});
