import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANCELLABLE_ORDER_STATUSES, nextOrderStatus } from '../../../../../src/modules/orders/domain/orderStatus.js';
import type { OrderStatus } from '../../../../../src/modules/orders/domain/order.js';

const home = (status: OrderStatus) => ({ status, pickup_point: null });
const pickup = (status: OrderStatus) => ({ status, pickup_point: { id: 'MR-123' } });

test('home delivery advances confirmed to received without an availability step', () => {
  assert.equal(nextOrderStatus(home('confirmed')), 'in_preparation');
  assert.equal(nextOrderStatus(home('in_preparation')), 'to_send');
  assert.equal(nextOrderStatus(home('to_send')), 'sent');
  assert.equal(nextOrderStatus(home('sent')), 'received');
});

test('pickup-point delivery inserts disponible between sent and received', () => {
  assert.equal(nextOrderStatus(pickup('sent')), 'disponible');
  assert.equal(nextOrderStatus(pickup('disponible')), 'received');
});

test('terminal and review states never advance', () => {
  for (const status of ['received', 'cancelled', 'need_review', 'return_review'] as const) {
    assert.equal(nextOrderStatus(home(status)), undefined, `${status} must not advance`);
    assert.equal(nextOrderStatus(pickup(status)), undefined, `${status} must not advance`);
  }
});

test('the transition is forward-only: no status maps back to an earlier one', () => {
  const order: OrderStatus[] = ['confirmed', 'in_preparation', 'to_send', 'sent', 'disponible', 'received'];
  for (const [index, status] of order.entries()) {
    const next = nextOrderStatus(pickup(status));
    if (next === undefined) continue;
    assert.ok(order.indexOf(next) > index, `${status} advanced backwards to ${next}`);
  }
});

test('only pre-shipping statuses are cancellable', () => {
  assert.deepEqual([...CANCELLABLE_ORDER_STATUSES].sort(), ['confirmed', 'in_preparation', 'to_send']);
  // A captured payment must never be reachable through cancellation.
  for (const status of ['sent', 'disponible', 'received'] as const) {
    assert.equal(CANCELLABLE_ORDER_STATUSES.has(status), false, `${status} must not be cancellable`);
  }
});
