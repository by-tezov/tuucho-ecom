import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InvalidLibrarySet,
  resolveUserLibraryUsers,
} from '../../../../../src/modules/operations/application/librarySetImport.js';

test('resolveUserLibraryUsers maps emails and ids and drops duplicates', async () => {
  const ids = await resolveUserLibraryUsers(['  Ada@Example.com ', 'ada@example.com', 'user-1'], async (identifier) => {
    if (identifier.toLowerCase() === 'ada@example.com') return { id: 'id-ada' };
    if (identifier === 'user-1') return { id: 'id-1' };
    return null;
  });
  assert.deepEqual(ids, ['id-ada', 'id-1']);
});

test('resolveUserLibraryUsers rejects an unknown email', async () => {
  await assert.rejects(
    () => resolveUserLibraryUsers(['missing@example.com'], async () => null),
    (error: unknown) => {
      assert.ok(error instanceof InvalidLibrarySet);
      assert.match(error.message, /Unknown user\(s\): missing@example.com/);
      return true;
    },
  );
});

test('resolveUserLibraryUsers rejects a blank entry', async () => {
  await assert.rejects(
    () => resolveUserLibraryUsers([''], async () => null),
    (error: unknown) => error instanceof InvalidLibrarySet,
  );
});
