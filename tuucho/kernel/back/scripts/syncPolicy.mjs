#!/usr/bin/env node
/**
 * Keeps every restatement of a hard rule identical to its one source.
 *
 * Source of truth: `tuucho/docs/policy/hard-rules.md`. Embeds exist only where a
 * tool needs the rule without opening that file (see the consumer table
 * there). `CLAUDE.md` is a router and must not embed rules: Cursor already
 * loads `AGENTS.md`, and Claude Code is told to read `AGENTS.md` first.
 *
 * A consumer marks where a rule goes:
 *
 *     <!-- policy:no-dashes-in-copy start -->
 *     ...generated, do not edit...
 *     <!-- policy:no-dashes-in-copy end -->
 *
 * `--check` fails when a copy has drifted, a marker names an unknown rule, or
 * `CLAUDE.md` contains a policy marker. Rules are edited in the source only.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const root = resolve('.');
const repoRoot = resolve(root, '../../..');
const sourcePath = resolve(root, '../../docs/policy/hard-rules.md');

const source = await readFile(sourcePath, 'utf8');
const rules = new Map();
for (const match of source.matchAll(
  /<!-- policy:([a-z0-9-]+) source -->\n([\s\S]*?)\n<!-- policy:\1 end-source -->/g,
)) {
  rules.set(match[1], match[2].trim());
}
if (rules.size === 0) {
  console.error('tuucho/docs/policy/hard-rules.md declares no rules.');
  process.exit(1);
}

/** Files that may embed a rule. Kept explicit: a stray marker in an unrelated
 * file should be a mistake to notice, not something silently rewritten.
 * `CLAUDE.md` is deliberately absent: it must stay a thin router. */
async function consumers() {
  const paths = [resolve(repoRoot, 'AGENTS.md')];
  for (const base of [resolve(repoRoot, '.cursor/rules')]) {
    const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile() && extname(entry.name) === '.mdc') paths.push(resolve(base, entry.name));
    }
  }
  for (const base of [resolve(repoRoot, '.agents/skills')]) {
    const walk = async (directory) => {
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (extname(entry.name) === '.md') paths.push(path);
      }
    };
    await walk(base);
  }
  return paths;
}

const check = process.argv.includes('--check');
const errors = [];
let embedded = 0;
let rewritten = 0;

const claudePath = resolve(repoRoot, 'CLAUDE.md');
const claude = await readFile(claudePath, 'utf8').catch(() => undefined);
if (claude !== undefined && /<!-- policy:[a-z0-9-]+ (?:start|source) -->/.test(claude)) {
  errors.push(
    'CLAUDE.md must not embed hard rules (it is a router). Keep the full set in AGENTS.md only.',
  );
}

for (const path of await consumers()) {
  const before = await readFile(path, 'utf8').catch(() => undefined);
  if (before === undefined) continue;
  let after = before;
  // Tolerates an empty marker pair, so a freshly added block gets filled.
  for (const match of before.matchAll(
    /<!-- policy:([a-z0-9-]+) start -->[\s\S]*?<!-- policy:\1 end -->/g,
  )) {
    const id = match[1];
    const rule = rules.get(id);
    const where = relative(repoRoot, path);
    if (rule === undefined) {
      errors.push(`${where} embeds unknown rule \`${id}\`. Known: ${[...rules.keys()].join(', ')}.`);
      continue;
    }
    embedded += 1;
    // A blank line after the opening marker keeps the rule its own Markdown
    // paragraph, which is also the shape prettier writes.
    const replacement = `<!-- policy:${id} start -->\n\n${rule}\n<!-- policy:${id} end -->`;
    if (match[0] !== replacement) after = after.replace(match[0], () => replacement);
  }
  if (after === before) continue;
  if (check) {
    errors.push(`${relative(repoRoot, path)} has an edited copy of a hard rule. Run \`npm run sync:policy\`.`);
  } else {
    await writeFile(path, after);
    rewritten += 1;
  }
}

if (errors.length > 0) {
  console.error(`Policy check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  console.error('Edit tuucho/docs/policy/hard-rules.md, never an embedded copy.');
  process.exit(1);
}

console.log(
  check
    ? `Policy check passed (${rules.size} rules, ${embedded} embedded copies in sync).`
    : `Policy synced (${rules.size} rules, ${embedded} embedded copies, ${rewritten} file(s) rewritten).`,
);
