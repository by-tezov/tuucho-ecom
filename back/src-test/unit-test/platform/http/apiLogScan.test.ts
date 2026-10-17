import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { forEachPrivateLogLine } from '../../../../src/platform/http/apiLog.js';

describe('forEachPrivateLogLine', () => {
  it('visits the rotated generation before the current file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'api-log-'));
    const filePath = join(dir, 'api.jsonl');
    try {
      await writeFile(`${filePath}.1`, '{"path":"/old"}\n', 'utf8');
      await writeFile(filePath, '{"path":"/new"}\n', 'utf8');
      const seen: string[] = [];
      await forEachPrivateLogLine(filePath, 1, (line) => seen.push(line));
      assert.deepEqual(seen, ['{"path":"/old"}', '{"path":"/new"}']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
