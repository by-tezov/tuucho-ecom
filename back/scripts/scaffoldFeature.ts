/**
 * Creates the skeleton of a new feature across both repositories.
 *
 * Starting a feature here means recalling a dozen conventions: four backend
 * layers, a router mounted through a composition root, an API documentation
 * section, a schema section, a migration, a `features.json` entry, a front API
 * client, a front route, and tests. Forgetting any one of them is not caught
 * until review, or not at all. This writes all of them as working stubs so the
 * first real edit is the feature itself.
 *
 * It never overwrites: an existing file is reported and left alone.
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve('.');
const frontRoot = resolve(root, '../pamsurin-front');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const name = args.find((argument) => !argument.startsWith('--'));

if (!name) {
  console.error('Usage: npm run scaffold -- <feature-name> [--dry-run]');
  console.error('Example: npm run scaffold -- wishlist');
  process.exit(1);
}
if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('A feature name must be lower-case kebab-case, e.g. `gift-wrap`.');
  process.exit(1);
}

const camel = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
const Pascal = camel[0].toUpperCase() + camel.slice(1);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const planned: Array<{ path: string; content: string }> = [];
function plan(path: string, content: string): void {
  planned.push({ path, content });
}

// ---------------------------------------------------------------- backend

plan(
  `src/modules/${camel}/domain/${camel}Rules.ts`,
  `/** Pure rules for ${name}. No Express, pg, filesystem, provider SDK or global
 * config may be imported here, which is what keeps this layer testable with a
 * plain function call. */

export type ${Pascal}Decision = 'allowed' | 'denied';

export function decide${Pascal}(): ${Pascal}Decision {
  return 'denied';
}
`,
);

plan(
  `src/modules/${camel}/domain/${camel}Rules.test.ts`,
  `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide${Pascal} } from './${camel}Rules.js';

test('${name} denies by default until a rule says otherwise', () => {
  assert.equal(decide${Pascal}(), 'denied');
});
`,
);

plan(
  `src/modules/${camel}/application/${camel}Workflow.ts`,
  `/** Workflow and transaction orchestration for ${name}.
 *
 * This layer owns the order of operations and the transaction boundary. Keep a
 * complete invariant together here, and do not hold a transaction open across
 * a network call. */
import type { Pool } from 'pg';
import { decide${Pascal} } from '../domain/${camel}Rules.js';

export async function run${Pascal}(_pool: Pool): Promise<{ decision: ReturnType<typeof decide${Pascal}> }> {
  return { decision: decide${Pascal}() };
}
`,
);

plan(
  `src/modules/${camel}/infrastructure/${camel}Store.ts`,
  `/** SQL for ${name}. Private to this module: another module must go through
 * \`domain/\` or \`application/\` instead of importing anything here. */
import type { Pool } from 'pg';

export async function count${Pascal}Rows(pool: Pool): Promise<number> {
  const result = await pool.query<{ count: string }>('select 0 as count');
  return Number(result.rows[0]?.count ?? 0);
}
`,
);

plan(
  `src/modules/${camel}/http/account${Pascal}.router.ts`,
  `import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { run${Pascal} } from '../application/${camel}Workflow.js';

export const account${Pascal}Router = Router();

account${Pascal}Router.get('/${name}', requireAuth, async (_req, res) => {
  const result = await run${Pascal}(pool);
  res.json({ success: true, ...result });
});
`,
);

plan(
  `src/api/${camel}.routes.ts`,
  `export { account${Pascal}Router } from '../modules/${camel}/http/account${Pascal}.router.js';
`,
);

const migrationStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
plan(
  `src/db/migrations/${migrationStamp}_${name.replace(/-/g, '_')}.sql`,
  `-- ${name}
--
-- Migrations are additive and must stay compatible with the previously
-- deployed application version: a code rollback cannot undo one. Never rename
-- or drop something the running version still reads.
--
-- Apply immediately with: npm run operation -- database-migrate --dev

-- Postgres 10 everywhere (see docs/schema/00-overview.md): no
-- gen_random_uuid(), ids come from crypto.randomUUID() in application code.
-- create table if not exists ${name.replace(/-/g, '_')} (
--   id uuid primary key,
--   created_at timestamptz not null default now()
-- );
`,
);

// ------------------------------------------------------------ front stubs

plan(
  `${frontRoot}/src/api/${camel}.ts`,
  `/** ${Pascal} API client. Paths here are checked against the backend's real
 * routes by \`npm run check:api\`. */
import { authHeaders, requestJson as request } from './client';

export interface ${Pascal}Result {
  success: true;
  decision: 'allowed' | 'denied';
}

export function get${Pascal}(accessToken: string): Promise<${Pascal}Result> {
  return request('/${name}', { headers: authHeaders(accessToken) });
}
`,
);

// -------------------------------------------------------------------- run

const skipped: string[] = [];
const written: string[] = [];

for (const item of planned) {
  const path = item.path.startsWith('/') ? item.path : resolve(root, item.path);
  if (await exists(path)) {
    skipped.push(item.path);
    continue;
  }
  if (!dryRun) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, item.content);
  }
  written.push(item.path);
}

console.log(dryRun ? `Would create ${written.length} files:` : `Created ${written.length} files:`);
for (const path of written) console.log(`  ${path}`);
if (skipped.length > 0) {
  console.log(`\nLeft alone (already present):`);
  for (const path of skipped) console.log(`  ${path}`);
}

const featuresPath = resolve(root, 'docs/features.json');
const features = JSON.parse(await readFile(featuresPath, 'utf8')) as Record<string, unknown>;
const hasEntry = Object.prototype.hasOwnProperty.call(features, name);

console.log(`
Still to do by hand, because each needs a decision this cannot make:

  1. Mount the router in src/app.ts (or src/opsRoutes.ts for an ops surface).
  2. Write the migration body, then run:
       npm run operation -- database-migrate --dev
  3. Add a docs/api/ section for every route, and a docs/schema/ section for
     every table. npm run check:routes fails until each route is documented.
  4. ${hasEntry ? `docs/features.json already has \`${name}\`.` : `Add a \`${name}\` entry to docs/features.json.`}
  5. Add the front route and wire the API client.
  6. npm run sync:routes && npm run check
`);
