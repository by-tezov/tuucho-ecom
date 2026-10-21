import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  folderShapeLengths,
  hiddenToStatic,
  parseHidden,
  refKeys,
  unrefKeys,
} from '../../../scripts/libraryVariants.js';

const shapeLengths = { almond: ['medium', 'short'], oval: ['medium'] };

describe('parseHidden', () => {
  it('reads absent, false and true as the whole product', () => {
    assert.deepEqual(parseHidden(undefined, shapeLengths), { hidden: false, hiddenShapeLengths: [] });
    assert.deepEqual(parseHidden(false, shapeLengths), { hidden: false, hiddenShapeLengths: [] });
    assert.deepEqual(parseHidden(true, shapeLengths), { hidden: true, hiddenShapeLengths: [] });
  });

  it('expands a whole shape and keeps a single shape/length', () => {
    assert.deepEqual(parseHidden({ $oval: true, $almond: { $short: true, $medium: false } }, shapeLengths), {
      hidden: false,
      hiddenShapeLengths: [
        { shapeKey: 'oval', lengthKey: 'medium' },
        { shapeKey: 'almond', lengthKey: 'short' },
      ],
    });
  });

  it('refuses a shape or length the product does not have', () => {
    assert.ok('error' in parseHidden({ $square: true }, shapeLengths));
    assert.ok('error' in parseHidden({ $almond: { $long: true } }, shapeLengths));
    assert.ok('error' in parseHidden('yes', shapeLengths));
  });
});

describe('hiddenToStatic', () => {
  it('writes the shortest form back', () => {
    assert.equal(hiddenToStatic(true, [], shapeLengths), true);
    assert.equal(hiddenToStatic(false, [], shapeLengths), undefined);
    assert.deepEqual(
      hiddenToStatic(
        false,
        [
          { shapeKey: 'oval', lengthKey: 'medium' },
          { shapeKey: 'almond', lengthKey: 'short' },
        ],
        shapeLengths,
      ),
      { $oval: true, $almond: { $short: true } },
    );
  });
});

describe('ref keys', () => {
  it('strips and adds the vocabulary marker down to the given depth', () => {
    const refs = { $almond: { $medium: { XS: 1 } } };
    assert.deepEqual(unrefKeys(refs, 2), { almond: { medium: { XS: 1 } } });
    assert.deepEqual(refKeys({ almond: { medium: { XS: 1 } } }, 2), refs);
    assert.deepEqual(unrefKeys({ almond: { medium: {} } }, 2), { almond: { medium: {} } });
  });
});

describe('folderShapeLengths', () => {
  const root = mkdtempSync(join(tmpdir(), 'pam-variants-'));
  after(() => rmSync(root, { recursive: true, force: true }));
  const photo = (...parts: string[]) => {
    mkdirSync(join(root, 'modal', ...parts), { recursive: true });
    writeFileSync(join(root, 'modal', ...parts, '1.webp'), '');
  };

  it('reads the folders in vocabulary order and ignores unknown names', () => {
    photo('oval', 'medium');
    photo('almond', 'short');
    photo('almond', 'medium', 'pink');
    photo('almond', 'giant');
    mkdirSync(join(root, 'modal', 'almond', 'long'), { recursive: true });
    photo('heart', 'medium');
    const vocab = {
      almond: { length: { medium: {}, long: {}, short: {} } },
      square: { length: { medium: {} } },
      oval: { length: { medium: {} } },
    };
    const result = folderShapeLengths(root, vocab);
    assert.deepEqual(result.shapeKeys, ['almond', 'oval']);
    assert.deepEqual(result.shapeLengths, { almond: ['medium', 'short'], oval: ['medium'] });
    assert.deepEqual(result.ignored.sort(), ['almond/giant/', 'heart/']);
  });
});
