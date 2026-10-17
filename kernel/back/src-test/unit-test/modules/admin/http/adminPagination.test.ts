import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  requestedAdminUserPageSize,
  requestedAdminUserRole,
  requestedOrderPageSize,
  requestedPage,
  requestedStockPageSize,
} from '../../../../../src/modules/admin/http/adminPagination.js';

test('page numbers default to 1 for anything but a positive decimal string', () => {
  assert.equal(requestedPage('3'), 3);
  for (const value of [undefined, '', '0', '-2', '1.5', '2e3', ' 2', 2, ['2']]) {
    assert.equal(requestedPage(value), 1, JSON.stringify(value));
  }
});

test('page sizes are limited to the allowed set', () => {
  for (const fn of [requestedOrderPageSize, requestedStockPageSize, requestedAdminUserPageSize]) {
    assert.equal(fn('30'), 30);
    assert.equal(fn('100'), 100);
    assert.equal(fn('1000000'), 15, 'no unbounded page');
    assert.equal(fn('20'), 15);
    assert.equal(fn(undefined), 15);
    assert.equal(fn(100), 15, 'query values are strings');
  }
});

test('the admin user filter selects staff or everyone only on an exact match', () => {
  assert.equal(requestedAdminUserRole('staff'), 'staff');
  assert.equal(requestedAdminUserRole('all'), 'all');
  assert.equal(requestedAdminUserRole('admin'), 'staff');
  assert.equal(requestedAdminUserRole('ADMIN'), 'user');
  assert.equal(requestedAdminUserRole(undefined), 'user');
});
