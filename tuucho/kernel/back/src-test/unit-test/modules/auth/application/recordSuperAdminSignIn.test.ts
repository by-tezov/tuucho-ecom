import { test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { SUPER_ADMIN_ROLE } from '../../../../../src/modules/identity/domain/staffPermissions.js';
import { recordSuperAdminSignIn } from '../../../../../src/modules/auth/application/recordSuperAdminSignIn.js';

const pool = {} as pg.Pool;
const account = { id: 'user-1', email: 'ada@example.com', role: SUPER_ADMIN_ROLE };
const meta = { ip: '203.0.113.8', userAgent: 'TestBrowser' };

test('a super-admin sign-in is journaled and alerted together', async () => {
  const kinds: string[] = [];
  const actions: string[] = [];
  recordSuperAdminSignIn(
    pool,
    account,
    meta,
    'signin',
    async (_db, input) => {
      actions.push(input.action);
      assert.equal(input.detail && (input.detail as { kind: string }).kind, 'signin');
    },
    (_pool, _account, _meta, kind) => {
      kinds.push(kind);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(kinds, ['signin']);
  assert.deepEqual(actions, ['accounts.signin']);
});

test('an idle resume uses kind resume for the journal and the alert', async () => {
  const kinds: string[] = [];
  let detailKind = '';
  recordSuperAdminSignIn(
    pool,
    account,
    meta,
    'resume',
    async (_db, input) => {
      detailKind = String((input.detail as { kind?: string }).kind);
    },
    (_pool, _account, _meta, kind) => {
      kinds.push(kind);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(kinds, ['resume']);
  assert.equal(detailKind, 'resume');
});

test('any other role is neither journaled nor alerted', async () => {
  let journaled = false;
  let alerted = false;
  recordSuperAdminSignIn(
    pool,
    { ...account, role: 'customer' },
    meta,
    'signin',
    async () => {
      journaled = true;
    },
    () => {
      alerted = true;
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(journaled, false);
  assert.equal(alerted, false);
});
