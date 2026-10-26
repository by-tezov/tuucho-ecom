import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRoleConfig,
  parseRoleConfig,
} from '../../../../../src/modules/identity/application/roleConfigFiles.js';

const preparator = {
  code: 'preparator',
  grants: [{ permission: 'orders', granted: true, dominant: false }],
  parents: [] as string[],
  assignable: [] as string[],
  assignableDominant: false,
  targetable: [] as string[],
  targetableDominant: false,
};

test('parseRoleConfig keeps staff roles and drops built-in roles and labels', () => {
  assert.equal(parseRoleConfig(null), null);
  assert.equal(parseRoleConfig({ roles: [{ code: 'manager' }] }), null);
  const parsed = parseRoleConfig({
    roles: [
      { ...preparator, label: 'Préparateur' },
      {
        code: 'user',
        label: 'Customer',
        system: true,
        grants: [],
        parents: [],
        assignable: [],
        assignableDominant: false,
        targetable: [],
        targetableDominant: false,
      },
      {
        code: 'super-admin',
        grants: [],
        parents: [],
        assignable: [],
        assignableDominant: false,
        targetable: [],
        targetableDominant: false,
      },
    ],
  });
  assert.equal(parsed?.length, 1);
  assert.equal(parsed?.[0]?.code, 'preparator');
  assert.equal('label' in (parsed?.[0] ?? {}), false);
});

test('mergeRoleConfig lets the environment replace a role and append new codes', () => {
  const merged = mergeRoleConfig(
    [preparator],
    [
      { ...preparator, grants: [{ permission: 'orders', granted: false, dominant: true }] },
      { ...preparator, code: 'manager', parents: ['preparator'] },
    ],
  );
  assert.deepEqual(
    merged.map((role) => role.code),
    ['preparator', 'manager'],
  );
  assert.equal(merged[0]?.grants[0]?.dominant, true);
  assert.deepEqual(merged[1]?.parents, ['preparator']);
});
