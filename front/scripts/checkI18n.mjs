#!/usr/bin/env node
/**
 * Locale consistency for `src/assets/i18n/strings.*.ts`.
 *
 * `tsc` already proves every locale satisfies `Strings`, so this covers what a
 * type cannot:
 *
 * - key parity against French, which is the source language (an optional key
 *   present in `fr` and forgotten elsewhere typechecks fine and renders empty);
 * - interpolation parity, so `{email}` cannot be dropped or renamed in one
 *   locale and silently render a gap;
 * - arrow-function parity, so a string that takes arguments in `fr` is not a
 *   plain string somewhere else;
 * - no em dash or en dash anywhere in customer-visible copy, which is a hard
 *   project rule and was previously enforced by prose alone;
 * - type/copy layout parity, so `types/<namespace>.ts` keeps mirroring
 *   `strings/<lang>/<namespace>.ts` instead of drifting back into one file;
 * - the administration dictionary (`src/assets/i18n/admin/strings/<lang>.ts`,
 *   checked as `adminUi.*`) gets every check above;
 * - untranslated values, ratcheted: a value byte-identical to French in
 *   another locale is usually a placeholder, but plenty are legitimately the
 *   same word, so the committed baseline may shrink and never grow.
 */
import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE_LANG = 'fr';
const LANGS = ['fr', 'en', 'th', 'es', 'it', 'nl', 'pt'];
const baselinePath = resolve('src/assets/i18n/untranslated-baseline.json');

const EM_DASH = '—';
const EN_DASH = '–';

/** Flattens one locale into `path -> value`.
 *
 * Copy lives in `strings/<lang>/<namespace>.ts`, one file per screen, and
 * `strings.<lang>.ts` only assembles them. Reading the namespace files directly
 * keeps this check independent of how the assembly is written, and lets an
 * error name the file the string is actually in.
 *
 * A function-valued string is recorded by shape (`fn(a,b)`) rather than by
 * body, so parity can be checked without comparing implementations. */
async function parseLocale(lang) {
  const dir = `src/assets/i18n/strings/${lang}`;
  const entries = (await readdir(dir)).filter((name) => name.endsWith('.ts')).sort();
  const values = new Map();

  for (const entry of entries) {
    await parseFile(`${dir}/${entry}`, entry.replace(/\.ts$/, ''), values);
  }
  // The administration's own dictionary (src/assets/i18n/admin), loaded only
  // with the admin routes, gets the same checks under `adminUi.*`.
  await parseFile(`src/assets/i18n/admin/strings/${lang}.ts`, 'adminUi', values);

  return values;
}

/** Records every value of one locale file into `values`. */
async function parseFile(file, namespace, values) {
  {
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let root;
    const findRoot = (node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText() === namespace && node.initializer) {
        root = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      }
      ts.forEachChild(node, findRoot);
    };
    findRoot(source);
    if (!root) throw new Error(`${file}: could not find \`export const ${namespace}\`.`);

    const record = (path, node) => {
      if (ts.isObjectLiteralExpression(node)) return walk(node, path);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        values.set(path, { kind: 'string', text: node.text, file });
        return undefined;
      }
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const params = node.parameters.map((parameter) => parameter.name.getText()).join(',');
        values.set(path, { kind: 'fn', text: node.getText(), shape: `fn(${params})`, file });
        return undefined;
      }
      if (ts.isArrayLiteralExpression(node)) {
        node.elements.forEach((element, index) => record(`${path}[${index}]`, element));
        return undefined;
      }
      if (ts.isTemplateExpression(node)) {
        values.set(path, { kind: 'template', text: node.getText(), file });
        return undefined;
      }
      values.set(path, { kind: ts.SyntaxKind[node.kind], text: node.getText(), file });
      return undefined;
    };

    function walk(object, prefix) {
      for (const property of object.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name =
          ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
            ? property.name.text
            : property.name.getText();
        record(prefix ? `${prefix}.${name}` : name, property.initializer);
      }
    }

    // `common.ts` holds the loose top-level labels, so its keys are not
    // namespaced; every other file contributes under its own name.
    if (namespace === 'common') walk(root, '');
    else record(namespace, root);
  }
}

function tokensOf(text) {
  return [...new Set([...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((match) => match[1]))].sort();
}

const locales = Object.fromEntries(
  await Promise.all(LANGS.map(async (lang) => [lang, await parseLocale(lang)])),
);
const source = locales[SOURCE_LANG];
const errors = [];
const untranslated = {};

for (const lang of LANGS) {
  for (const [path, value] of locales[lang]) {
    const text = value.kind === 'string' ? value.text : value.text;
    if (text.includes(EM_DASH) || text.includes(EN_DASH)) {
      errors.push(
        `${lang}: \`${path}\` contains an em dash or en dash. Use a period, comma, colon, or parentheses.`,
      );
    }
  }
}

for (const lang of LANGS) {
  if (lang === SOURCE_LANG) continue;
  const current = locales[lang];
  const identical = [];

  for (const [path, expected] of source) {
    const actual = current.get(path);
    if (!actual) {
      errors.push(`${lang}: missing \`${path}\` (present in ${SOURCE_LANG}, ${expected.file}).`);
      continue;
    }
    if (expected.kind !== actual.kind) {
      errors.push(`${lang}: \`${path}\` is ${actual.kind} but ${SOURCE_LANG} has ${expected.kind}.`);
      continue;
    }
    if (expected.kind === 'fn' && expected.shape !== actual.shape) {
      errors.push(`${lang}: \`${path}\` takes ${actual.shape} but ${SOURCE_LANG} takes ${expected.shape}.`);
      continue;
    }
    const expectedTokens = tokensOf(expected.text);
    const actualTokens = tokensOf(actual.text);
    if (expectedTokens.join('|') !== actualTokens.join('|')) {
      errors.push(
        `${lang}: \`${path}\` interpolates {${actualTokens.join('}, {')}} but ${SOURCE_LANG} interpolates {${expectedTokens.join('}, {')}}.`,
      );
      continue;
    }
    if (expected.kind === 'string' && expected.text === actual.text && expected.text.trim() !== '') {
      identical.push(path);
    }
  }

  for (const path of current.keys()) {
    if (!source.has(path)) errors.push(`${lang}: \`${path}\` has no ${SOURCE_LANG} counterpart.`);
  }

  untranslated[lang] = identical.sort();
}

// Interfaces are split one file per screen, mirroring the copy. A namespace
// whose type went back into `types.ts` is not an error TypeScript can see, so
// it is checked here: `common` and `checkoutSessionExpired` are deliberately
// inline in `Strings`, because their keys sit at the top level.
const INLINE_NAMESPACES = new Set(['common', 'checkoutSessionExpired']);
const copyNamespaces = (await readdir(`src/assets/i18n/strings/${SOURCE_LANG}`))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => name.replace(/\.ts$/, ''))
  .filter((namespace) => !INLINE_NAMESPACES.has(namespace));
const typeNamespaces = new Set(
  (await readdir('src/assets/i18n/types'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => name.replace(/\.ts$/, '')),
);
for (const namespace of copyNamespaces) {
  if (!typeNamespaces.has(namespace)) {
    errors.push(
      `src/assets/i18n/types/${namespace}.ts is missing, but \`strings/${SOURCE_LANG}/${namespace}.ts\` exists.`,
    );
  }
}
for (const namespace of typeNamespaces) {
  if (!copyNamespaces.includes(namespace)) {
    errors.push(
      `src/assets/i18n/types/${namespace}.ts has no \`strings/${SOURCE_LANG}/${namespace}.ts\` to type.`,
    );
  }
}

let baseline = {};
try {
  baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
} catch {
  baseline = {};
}

if (process.argv.includes('--update-baseline')) {
  await writeFile(
    baselinePath,
    `${JSON.stringify(
      {
        $comment:
          'Values byte-identical to the French source. Some are legitimately the same word in both languages; the rest are untranslated. `npm run check:i18n` fails when a locale gains new ones. Regenerate with `npm run check:i18n -- --update-baseline` only after deliberately translating or accepting entries.',
        ...Object.fromEntries(
          LANGS.filter((lang) => lang !== SOURCE_LANG).map((lang) => [lang, untranslated[lang]]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `i18n baseline updated (${Object.values(untranslated).reduce((total, list) => total + list.length, 0)} entries identical to ${SOURCE_LANG}).`,
  );
  process.exit(0);
}

for (const lang of LANGS) {
  if (lang === SOURCE_LANG) continue;
  const allowed = new Set(baseline[lang] ?? []);
  const added = untranslated[lang].filter((path) => !allowed.has(path));
  for (const path of added) {
    errors.push(
      `${lang}: \`${path}\` is byte-identical to ${SOURCE_LANG}. Translate it, or accept it with \`npm run check:i18n -- --update-baseline\`.`,
    );
  }
}

if (errors.length > 0) {
  console.error(`i18n check failed (${errors.length}):`);
  for (const error of errors.slice(0, 60)) console.error(`- ${error}`);
  if (errors.length > 60) console.error(`- ... and ${errors.length - 60} more.`);
  process.exit(1);
}

const keyCount = source.size;
const identicalTotal = Object.values(untranslated).reduce((total, list) => total + list.length, 0);
console.log(
  `i18n check passed (${LANGS.length} locales, ${keyCount} keys each, ${identicalTotal} values still identical to ${SOURCE_LANG}).`,
);
