import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedWhere, type GalleryFeedParams } from '../../../../../src/modules/catalog/application/feedWhere.js';

const USER = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';

type Params = Omit<GalleryFeedParams, 'cursor' | 'limit'>;

/** Every `$n` in the clause must point at a value, and every value must be
 * referenced: the page and count queries share this, and appended cursor /
 * limit placeholders start at `nextIndex`. */
function assertPlaceholdersMatch(params: Params) {
  const { sql, values, nextIndex } = buildFeedWhere(params);
  const used = new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
  assert.deepEqual(
    [...used].sort((a, b) => a - b),
    values.map((_, i) => i + 1),
    sql,
  );
  assert.equal(nextIndex, values.length + 1);
  return { sql, values };
}

test('the default feed is public, visible, non-hidden nail sets', () => {
  const { sql, values } = assertPlaceholdersMatch({});
  assert.match(sql, /hidden = false/);
  assert.match(sql, /product_type = 'nail'/);
  assert.match(sql, /audience = 'public'/);
  assert.deepEqual(values, []);
});

test('productType is whitelisted, never interpolated from input', () => {
  const { sql } = buildFeedWhere({ productType: "nail'; drop table products; --" as Params['productType'] });
  assert.match(sql, /product_type = 'nail'/);
  assert.doesNotMatch(sql, /drop table/);
  assert.match(buildFeedWhere({ productType: 'nail_single' }).sql, /product_type = 'nail_single'/);
});

test('a signed-in user also sees their own library sets', () => {
  const { sql, values } = assertPlaceholdersMatch({ userId: USER });
  assert.match(sql, /audience = 'public' or \(audience = 'user-library'/);
  assert.deepEqual(values, [USER]);
});

test('single nails never expose user-library products', () => {
  const { sql, values } = buildFeedWhere({ userId: USER, productType: 'nail_single' });
  assert.match(sql, /audience = 'public'/);
  assert.doesNotMatch(sql, /user-library/);
  assert.deepEqual(values, []);
});

test('the library-only filter is empty without a verified user', () => {
  assert.match(buildFeedWhere({ userLibraryOnly: true }).sql, /\band false\b/);
  assert.match(buildFeedWhere({ userLibraryOnly: true, userId: USER, productType: 'nail_single' }).sql, /\band false\b/);
  const { sql, values } = assertPlaceholdersMatch({ userLibraryOnly: true, userId: USER });
  assert.doesNotMatch(sql, /audience = 'public'/);
  assert.deepEqual(values, [USER]);
});

test('non-uuid ids are dropped before the uuid cast', () => {
  const { sql, values } = assertPlaceholdersMatch({ ids: ['nope', PRODUCT, "1' or '1'='1"] });
  assert.deepEqual(values, [[PRODUCT]]);
  assert.match(sql, /id = any\(\$1::uuid\[\]\)/);
  assert.match(buildFeedWhere({ ids: ['nope'] }).sql, /\band false\b/);
});

test('the price range is applied only when both bounds are valid', () => {
  assert.deepEqual(buildFeedWhere({ minPrice: 10 }).values, []);
  assert.deepEqual(buildFeedWhere({ minPrice: 30, maxPrice: 10 }).values, []);
  assert.deepEqual(buildFeedWhere({ minPrice: -1, maxPrice: 10 }).values, []);
  assert.deepEqual(buildFeedWhere({ minPrice: Number.NaN, maxPrice: 10 }).values, []);
  assert.deepEqual(assertPlaceholdersMatch({ minPrice: 10, maxPrice: 10 }).values, [10, 10]);
});

test('stock in/out are complementary; all adds nothing', () => {
  const inSql = buildFeedWhere({ stock: 'in' }).sql;
  const outSql = buildFeedWhere({ stock: 'out' }).sql;
  const allSql = buildFeedWhere({ stock: 'all' }).sql;
  assert.equal(outSql.length - inSql.length, 'not '.length);
  assert.ok(allSql.length < inSql.length);
});

test('every filter combined keeps placeholders aligned', () => {
  const { values } = assertPlaceholdersMatch({
    userId: USER,
    occasion: ['Mariage'],
    shape: ['almond'],
    length: ['long'],
    size: ['M', 'L'],
    ids: [PRODUCT],
    stock: 'in',
    minPrice: 5,
    maxPrice: 50,
  });
  assert.deepEqual(values, [USER, ['Mariage'], ['almond'], ['long'], ['M', 'L'], [PRODUCT], 5, 50]);
});

test('empty filter arrays add no clause', () => {
  assert.deepEqual(buildFeedWhere({ occasion: [], shape: [], length: [], size: [], ids: [] }), buildFeedWhere({}));
});
