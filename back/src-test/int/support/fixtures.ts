/**
 * The smallest real rows a test needs.
 *
 * Where the application already owns a creation path, the fixture calls it
 * rather than re-writing its SQL: `registerUser` goes through
 * `POST /auth/register`, and a catalogue set through `createLibrarySet`, which
 * is the same function the library import uses. A fixture that copies an
 * INSERT is a second definition of the schema, and it goes stale silently.
 *
 * Direct SQL is used only for the vocabulary tables, which have no creation
 * path because they arrive with the seed, and for the two columns no endpoint
 * exposes (an account's role, a variant's stock).
 */
import { randomUUID } from 'node:crypto';
import { api, pool } from './stack.js';

export const TEST_PASSWORD = 'IntegrationPass123!';
export const SHAPE_KEY = 'almond';
export const LENGTH_KEY = 'medium';
export const SIZE = 'M';

export function uniqueEmail(prefix = 'int'): string {
  return `${prefix}-${randomUUID()}@pamsurin.test`;
}

export type TestUser = {
  email: string;
  password: string;
  accessToken: string;
  id: string;
};

export async function registerUser(overrides: { email?: string; language?: string } = {}): Promise<TestUser> {
  const email = overrides.email ?? uniqueEmail();
  const response = await api<{ accessToken: string; user: { id: string } }>('POST', '/auth/register', {
    body: {
      email,
      password: TEST_PASSWORD,
      gdprConsent: { accepted: true },
      language: overrides.language ?? 'fr',
    },
    expectStatus: 201,
  });
  return { email, password: TEST_PASSWORD, accessToken: response.body.accessToken, id: response.body.user.id };
}

/** No endpoint promotes an account, by design: the role is an operator
 * decision made through the ops surface, which is not mounted here. */
export async function promoteToAdmin(userId: string): Promise<void> {
  await pool.query(`update users set role = 'super-admin' where id = $1`, [userId]);
  await pool.query(
    `insert into user_roles (user_id, role_code) values ($1, 'super-admin') on conflict do nothing`,
    [userId],
  );
}

/** Shapes, lengths and sizes arrive with the catalogue seed, and the reset
 * truncates them with everything else. One of each is enough for any test
 * that needs a purchasable variant. */
export async function seedVocabulary(): Promise<void> {
  await pool.query(`insert into shapes (key, label) values ($1, $2) on conflict (key) do nothing`, [
    SHAPE_KEY,
    JSON.stringify({ fr: 'Amande', en: 'Almond' }),
  ]);
  await pool.query(
    `insert into shape_lengths (shape_key, length_key, value, label)
     values ($1, $2, $3, $4) on conflict do nothing`,
    [SHAPE_KEY, LENGTH_KEY, '12', JSON.stringify({ fr: 'Moyenne', en: 'Medium' })],
  );
}

export type TestProduct = {
  id: string;
  productUid: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  price: number;
};

/** A visible nail set with one variant in stock, created the way the library
 * import creates one. */
export async function createProduct(
  overrides: { productUid?: string; price?: number; quantity?: number } = {},
): Promise<TestProduct> {
  await seedVocabulary();
  const { createLibrarySet } = await import('../../../src/modules/operations/application/libraryImport.js');
  const productUid = overrides.productUid ?? `INT${String(Math.floor(Math.random() * 9000 + 1000))}`;
  const price = overrides.price ?? 25;

  const id = await createLibrarySet(pool, {
    productUid,
    productType: 'nail',
    title: { fr: `Set ${productUid}`, en: `Set ${productUid}` },
    desc: { fr: 'Set de test.', en: 'Test set.' },
    occasion: null,
    alt: null,
    hidden: false,
    featuredFrom: null,
    featuredFor: null,
    creationDate: new Date().toISOString().slice(0, 10),
    audience: 'public',
    accessoryType: 'default',
    accessoryPacks: {},
    accessoryPackPrices: {},
    inCartCarousel: false,
    loyaltyMultiplier: 1,
    shapeKeys: [SHAPE_KEY],
    shapeLengths: { [SHAPE_KEY]: [LENGTH_KEY] },
    hiddenShapeLengths: [],
    colorMainKeys: [],
    colorSecondaryKeys: [],
  } as Parameters<typeof createLibrarySet>[1]);

  await pool.query(`insert into product_prices (id, product_id, price, effective_at) values ($1, $2, $3, now())`, [
    randomUUID(),
    id,
    price,
  ]);
  await pool.query(
    `insert into product_availability (product_id, shape_key, length_key, size, quantity)
     values ($1, $2, $3, $4, $5)`,
    [id, SHAPE_KEY, LENGTH_KEY, SIZE, overrides.quantity ?? 5],
  );

  return { id, productUid, shapeKey: SHAPE_KEY, lengthKey: LENGTH_KEY, size: SIZE, price };
}
