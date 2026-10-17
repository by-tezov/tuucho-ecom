import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activityActors,
  parseActivityLogLine,
  queryActivityEntries,
  type ActivityEntry,
} from '../../../../src/modules/activity/application/listActivity.js';
import {
  appendActivityLogLine,
  clearActivityLogFile,
  readActivityLogLines,
} from '../../../../src/modules/activity/infrastructure/activityLogFile.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';

function entry(overrides: Partial<ActivityEntry> & Pick<ActivityEntry, 'id' | 'occurredAt'>): ActivityEntry {
  return {
    category: 'catalogue',
    action: 'catalogue.stock',
    outcome: 'success',
    origin: 'admin',
    actorUserId: ACTOR,
    actorEmail: 'ada@example.com',
    actorLabel: 'ada@example.com',
    operatorUser: null,
    operatorHost: null,
    mode: null,
    sourceCommand: null,
    targetType: 'product',
    targetId: '0117',
    targets: [],
    summary: 'Stock 0117',
    detail: {},
    ...overrides,
  };
}

describe('activity journal file', () => {
  it('appends, reads, and clears a private log', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'activity-log-'));
    const filePath = join(dir, 'activity.jsonl');
    await appendActivityLogLine(filePath, '{"at":"2026-10-06T00:00:00.000Z","id":"a"}\n');
    await appendActivityLogLine(filePath, '{"at":"2026-10-06T01:00:00.000Z","id":"b"}');
    assert.deepEqual(await readActivityLogLines(filePath), [
      '{"at":"2026-10-06T00:00:00.000Z","id":"a"}',
      '{"at":"2026-10-06T01:00:00.000Z","id":"b"}',
    ]);
    assert.equal(await clearActivityLogFile(filePath), 1);
    assert.deepEqual(await readActivityLogLines(filePath), []);
    assert.equal(await readFile(filePath, 'utf8').catch((error: NodeJS.ErrnoException) => error.code), 'ENOENT');
  });

  it('filters by category and search, and an administrator excludes other origins', () => {
    const lines = [
      entry({ id: '1', occurredAt: '2026-10-06T01:00:00.000Z', summary: 'Stock 0117', targetId: '0117' }),
      entry({
        id: '2',
        occurredAt: '2026-10-06T02:00:00.000Z',
        category: 'orders',
        summary: 'Commande 42',
        targetId: '42',
      }),
      entry({
        id: '3',
        occurredAt: '2026-10-06T03:00:00.000Z',
        origin: 'operator',
        actorUserId: null,
        actorEmail: null,
        actorLabel: 'te@host (dev)',
        summary: 'Stock 0117 seed',
        targetId: '0117',
      }),
    ];
    const stock = queryActivityEntries(lines, { category: 'catalogue', q: '0117', page: 1, pageSize: 30 });
    assert.deepEqual(
      stock.entries.map((item) => item.id),
      ['3', '1'],
    );
    const adminOnly = queryActivityEntries(lines, { actorUserId: ACTOR, q: '0117', page: 1, pageSize: 30 });
    assert.deepEqual(
      adminOnly.entries.map((item) => item.id),
      ['1'],
    );
  });

  it('pages newest first and skips a line that is not a journal record', () => {
    const parsed = [
      'not-json',
      '{"id":1}',
      JSON.stringify(entry({ id: 'old', occurredAt: '2026-10-01T00:00:00.000Z' })),
      JSON.stringify(entry({ id: 'new', occurredAt: '2026-10-06T00:00:00.000Z' })),
    ].flatMap(
      (line) => {
        const item = parseActivityLogLine(line);
        return item ? [item] : [];
      },
    );
    const page = queryActivityEntries(parsed, { page: 1, pageSize: 1 });
    assert.equal(page.total, 2);
    assert.equal(page.entries[0]?.id, 'new');
  });

  it('lists each administrator once, with the email from the newest line', () => {
    const actors = activityActors([
      entry({ id: '1', occurredAt: '2026-10-01T00:00:00.000Z', actorEmail: 'old@example.com' }),
      entry({ id: '2', occurredAt: '2026-10-06T00:00:00.000Z', actorEmail: 'new@example.com' }),
      entry({
        id: '3',
        occurredAt: '2026-10-06T01:00:00.000Z',
        origin: 'system',
        actorUserId: null,
        actorEmail: null,
        actorLabel: 'loyalty',
      }),
    ]);
    assert.deepEqual(actors, [{ userId: ACTOR, email: 'new@example.com' }]);
  });
});
