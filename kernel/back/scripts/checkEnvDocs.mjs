#!/usr/bin/env node
/**
 * A number the documentation states for an environment variable must be the
 * number that variable actually holds.
 *
 * Settings that used to live in the database moved to `GIFT_*` and `LOYALTY_*`
 * env, and the move quietly changed two of them: the gift budget ceiling went
 * from 500 EUR to 150 and the accessory ceiling from 100 to 10, while the code
 * constant and four places in `docs/api/` still said 500 and 100. Nothing
 * noticed. Ten API tests failed with an error nobody could place, which is the
 * cheap version of the same thing happening on a customer's screen.
 *
 * `docs/schema/tables.json` closed this for the database. This closes it for
 * configuration: whenever documentation writes a value next to the variable it
 * belongs to, the two have to agree.
 *
 * The documented form is deliberately `currently`, not `default`: these values
 * are required in the environment and have no code default to fall back on, so
 * calling one a default was itself part of the confusion.
 */
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const root = resolve('.');
const envPath = resolve(root, '.env/.public.env');
const docsRoot = resolve(root, 'docs');

/** `` `KEY`, currently 150 € `` and `` `KEY` (currently 396 days …) ``. The
 * variable name and the value have to sit close together, so a sentence that
 * merely mentions a variable is not read as a claim about its value. */
const CLAIM = /`([A-Z][A-Z0-9_]{3,})`[^`\n]{0,48}?currently\s+([0-9]+(?:\.[0-9]+)?)/g;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return extname(entry.name) === '.md' ? [path] : [];
    }),
  );
  return nested.flat();
}

const env = new Map();
for (const line of (await readFile(envPath, 'utf8')).split('\n')) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (match) env.set(match[1], match[2].trim());
}

const errors = [];
let verified = 0;

for (const path of (await walk(docsRoot)).sort()) {
  const where = relative(root, path);
  // Plans describe behaviour that was not shipped yet or has since moved on.
  // `docs/plans/README.md` says they are not live operator documentation, so
  // holding them to the running configuration would be wrong.
  if (where.startsWith('docs/plans/')) continue;
  const text = await readFile(path, 'utf8');
  for (const match of text.matchAll(CLAIM)) {
    const [, key, claimed] = match;
    const actual = env.get(key);
    if (actual === undefined) continue;
    const line = text.slice(0, match.index).split('\n').length;
    verified += 1;
    if (Number(claimed) !== Number(actual)) {
      errors.push(`${where}:${line}: \`${key}\` is documented as ${claimed}, but .env/.public.env sets ${actual}.`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Env documentation check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Env documentation check passed (${verified} documented values match .env/.public.env).`);
