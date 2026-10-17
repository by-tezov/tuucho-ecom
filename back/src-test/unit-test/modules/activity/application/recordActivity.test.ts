import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ActivityRecordError,
  activityLogRecord,
  recordActivity,
} from '../../../../../src/modules/activity/application/recordActivity.js';

describe('recordActivity origin rules', () => {
  it('rejects admin rows without actor_user_id', async () => {
    await assert.rejects(
      () =>
        recordActivity({} as never, {
          category: 'settings',
          action: 'preferences.patch',
          summary: 'Préférences mises à jour',
          origin: 'admin',
        }),
      (error: unknown) => error instanceof ActivityRecordError && error.message === 'admin_actor_required',
    );
  });

  it('rejects system rows without actor label', async () => {
    await assert.rejects(
      () =>
        recordActivity({} as never, {
          category: 'orders',
          action: 'order.status',
          summary: 'Commande avancée',
          origin: 'system',
        }),
      (error: unknown) => error instanceof ActivityRecordError && error.message === 'system_actor_required',
    );
  });

  it('keeps an operator line as operator and drops a passed admin actor', () => {
    const record = activityLogRecord({
      category: 'catalogue',
      action: 'library.seed',
      summary: 'Import catalogue',
      origin: 'operator',
      actorUserId: 'should-be-ignored',
      operatorUser: 'tezov',
      operatorHost: 'laptop',
      mode: 'dev',
    });
    assert.equal(record.origin, 'operator');
    assert.equal(record.actorUserId, null);
    assert.equal(record.at, record.occurredAt);
  });
});
