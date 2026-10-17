#!/usr/bin/env node
/**
 * Adds, renames or removes one localized string across every file that must
 * agree about it: the `Strings` type and all seven locale modules.
 *
 * Doing that by hand means eight edits spread over the `Strings` assembly, one
 * namespace type file and seven locale files, which is slow and easy to leave
 * half-done. This resolves the `Strings` type graph across `types/` to find the
 * exact declaration site for a key path, splices the edit in
 * (rather than reprinting the file, so comments and formatting survive), and
 * formats the touched files afterwards.
 *
 * New keys are seeded with the French text in every locale and reported as
 * needing translation. They are deliberately not added to the untranslated
 * baseline, so `npm run check:i18n` fails until they are really translated.
 */
import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const SOURCE_LANG = 'fr';
const LANGS = ['fr', 'en', 'th', 'es', 'it', 'nl', 'pt'];
const typesPath = 'src/assets/i18n/types.ts';
/** Interfaces live one file per screen under `types/`, mirroring `strings/`.
 * `types.ts` keeps only `Strings` itself and the labels belonging to no screen,
 * so a key path can land in either and the whole set has to be resolved. */
const typesDir = 'src/assets/i18n/types';

/** `types.ts` plus every namespace file, parsed once and kept with its text so
 * a splice can be written back to the file the declaration is actually in. */
async function loadTypeFiles() {
  const names = (await readdir(typesDir)).filter((name) => name.endsWith('.ts')).sort();
  const files = new Map();
  for (const path of [typesPath, ...names.map((name) => `${typesDir}/${name}`)]) {
    const text = await readFile(path, 'utf8');
    files.set(path, { text, file: sourceFileOf(path, text) });
  }
  return files;
}
/** Copy lives one file per screen. A dotted key's first segment names the
 * namespace file; a top-level label lives in `common.ts`. */
function localePath(lang, path) {
  const segments = path.split('.');
  return segments.length > 1
    ? `src/assets/i18n/strings/${lang}/${segments[0]}.ts`
    : `src/assets/i18n/strings/${lang}/common.ts`;
}

/** The exported binding inside that file, and the key path relative to it. */
function localeAnchor(path) {
  const segments = path.split('.');
  return segments.length > 1
    ? { binding: segments[0], rest: segments.slice(1) }
    : { binding: 'common', rest: segments };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sourceFileOf(path, text) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
}

/** Every interface across the type files, by name, so a property whose type is
 * a named interface can be followed the same way as an inline object type. */
function interfacesIn(typeFiles) {
  const byName = new Map();
  for (const { file } of typeFiles.values()) {
    file.forEachChild((node) => {
      if (ts.isInterfaceDeclaration(node)) byName.set(node.name.text, node);
    });
  }
  return byName;
}

function membersOf(typeNode, interfaces) {
  if (!typeNode) return undefined;
  if (ts.isTypeLiteralNode(typeNode)) return typeNode;
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    return interfaces.get(typeNode.typeName.text);
  }
  return undefined;
}

function memberNamed(container, name) {
  for (const member of container.members) {
    if (ts.isPropertySignature(member) && member.name && member.name.getText().replace(/'/g, '') === name) {
      return member;
    }
  }
  return undefined;
}

/** Walks a dotted key path through the type graph. Returns the container that
 * should hold the final segment, plus the existing member if there is one. */
function locateInTypes(typeFiles, path) {
  const interfaces = interfacesIn(typeFiles);
  const root = interfaces.get('Strings');
  if (!root) fail(`${typesPath}: no \`Strings\` interface found.`);
  const segments = path.split('.');
  let container = root;
  for (const segment of segments.slice(0, -1)) {
    const member = memberNamed(container, segment);
    if (!member) fail(`\`${path}\`: \`${segment}\` does not exist in the Strings type.`);
    const next = membersOf(member.type, interfaces);
    if (!next) fail(`\`${path}\`: \`${segment}\` is not an object type, so it cannot hold a child key.`);
    container = next;
  }
  const last = segments[segments.length - 1];
  // The container may sit in `types.ts` or in any namespace file; the write has
  // to go back to the one it was parsed from.
  return {
    container,
    existing: memberNamed(container, last),
    leaf: last,
    path: container.getSourceFile().fileName,
  };
}

function propertyNamed(objectLiteral, name) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : property.name.getText();
    if (propertyName === name) return property;
  }
  return undefined;
}

function localeRoot(file, binding, where) {
  let root;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === binding && node.initializer) {
      root = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!root || !ts.isObjectLiteralExpression(root)) {
    fail(`${where}: could not find \`export const ${binding}\` object literal.`);
  }
  return root;
}

function locateInLocale(file, lang, path) {
  const where = localePath(lang, path);
  const { binding, rest } = localeAnchor(path);
  let container = localeRoot(file, binding, where);
  for (const segment of rest.slice(0, -1)) {
    const property = propertyNamed(container, segment);
    if (!property) fail(`${where}: \`${segment}\` is missing, so \`${path}\` cannot be placed.`);
    if (!ts.isObjectLiteralExpression(property.initializer)) {
      fail(`${where}: \`${segment}\` is not an object literal.`);
    }
    container = property.initializer;
  }
  const leaf = rest[rest.length - 1];
  return { container, existing: propertyNamed(container, leaf), leaf };
}

/** Inserts `text` as the last entry of a braced block, just before its closing
 * brace, keeping the file's own formatting intact. */
function spliceIntoBlock(text, block, entry) {
  const closing = block.getEnd() - 1;
  const before = text.slice(0, closing);
  // An interface body separates members with `;`, an object literal with `,`.
  // Only the latter needs one added when the previous entry had no trailing
  // separator; adding a comma after a `;` produces a file TypeScript cannot
  // parse at all.
  const lastMeaningful = before.replace(/\s+$/, '').slice(-1);
  const needsComma = lastMeaningful !== '' && !'{,;'.includes(lastMeaningful);
  return `${before}${needsComma ? ',' : ''}\n${entry}\n${text.slice(closing)}`;
}

function spliceOut(text, node) {
  let start = node.getStart();
  let end = node.getEnd();
  // Take the trailing comma and the rest of the line with it.
  while (end < text.length && (text[end] === ',' || text[end] === ' ')) end += 1;
  if (text[end] === '\n') end += 1;
  while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start -= 1;
  return text.slice(0, start) + text.slice(end);
}

function quote(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Map(
  rest
    .filter((argument) => argument.startsWith('--'))
    .map((argument) => {
      const [name, ...value] = argument.slice(2).split('=');
      return [name, value.join('=')];
    }),
);
const positional = rest.filter((argument) => !argument.startsWith('--'));

if (!command || command === 'help') {
  console.log(`Usage:
  npm run i18n -- add <key.path> "<french text>" [--en="..."] [--th="..."] ...
  npm run i18n -- remove <key.path>
  npm run i18n -- rename <old.path> <new.path>

Every command edits the owning type file under ${typesDir}/ (or ${typesPath}
for a top-level label) and all ${LANGS.length} locale files together,
then formats them. Run \`npm run check:i18n\` afterwards.`);
  process.exit(0);
}

const typeFiles = await loadTypeFiles();
const keyPath = positional[0] ?? '';
const localeTexts = Object.fromEntries(
  await Promise.all(LANGS.map(async (lang) => [lang, await readFile(localePath(lang, keyPath), 'utf8')])),
);
const touched = new Set();

if (command === 'add') {
  const [path, french] = positional;
  if (!path || french === undefined) fail('Usage: npm run i18n -- add <key.path> "<french text>"');

  const spot = locateInTypes(typeFiles, path);
  if (spot.existing) fail(`\`${path}\` already exists in the Strings type.`);
  await writeFile(
    spot.path,
    spliceIntoBlock(typeFiles.get(spot.path).text, spot.container, `  ${spot.leaf}: string;`),
  );
  touched.add(spot.path);

  const needTranslation = [];
  for (const lang of LANGS) {
    const value = lang === SOURCE_LANG ? french : (flags.get(lang) ?? french);
    if (lang !== SOURCE_LANG && !flags.has(lang)) needTranslation.push(lang);
    const file = sourceFileOf(localePath(lang, path), localeTexts[lang]);
    const place = locateInLocale(file, lang, path);
    if (place.existing) fail(`${localePath(lang, path)}: \`${path}\` already exists.`);
    await writeFile(
      localePath(lang, path),
      spliceIntoBlock(localeTexts[lang], place.container, `  ${place.leaf}: ${quote(value)},`),
    );
    touched.add(localePath(lang, path));
  }

  console.log(`Added \`${path}\` to the Strings type and ${LANGS.length} locales.`);
  if (needTranslation.length > 0) {
    console.log(
      `Seeded with the French text in: ${needTranslation.join(', ')}. Translate them, then run \`npm run check:i18n\` (it fails until they differ from ${SOURCE_LANG}).`,
    );
  }
} else if (command === 'remove') {
  const [path] = positional;
  if (!path) fail('Usage: npm run i18n -- remove <key.path>');

  const spot = locateInTypes(typeFiles, path);
  if (!spot.existing) fail(`\`${path}\` does not exist in the Strings type.`);
  await writeFile(spot.path, spliceOut(typeFiles.get(spot.path).text, spot.existing));
  touched.add(spot.path);

  for (const lang of LANGS) {
    const file = sourceFileOf(localePath(lang, path), localeTexts[lang]);
    const place = locateInLocale(file, lang, path);
    if (!place.existing) continue;
    await writeFile(localePath(lang, path), spliceOut(localeTexts[lang], place.existing));
    touched.add(localePath(lang, path));
  }
  console.log(`Removed \`${path}\`. Check for remaining usages of \`t.${path}\` before committing.`);
} else if (command === 'rename') {
  const [from, to] = positional;
  if (!from || !to) fail('Usage: npm run i18n -- rename <old.path> <new.path>');
  if (from.split('.').slice(0, -1).join('.') !== to.split('.').slice(0, -1).join('.')) {
    fail('rename only changes the last segment; move a key by remove + add.');
  }
  const newLeaf = to.split('.').pop();

  const spot = locateInTypes(typeFiles, from);
  if (!spot.existing) fail(`\`${from}\` does not exist in the Strings type.`);
  if (memberNamed(spot.container, newLeaf)) fail(`\`${to}\` already exists.`);
  const nameNode = spot.existing.name;
  const ownerText = typeFiles.get(spot.path).text;
  await writeFile(
    spot.path,
    ownerText.slice(0, nameNode.getStart()) + newLeaf + ownerText.slice(nameNode.getEnd()),
  );
  touched.add(spot.path);

  for (const lang of LANGS) {
    const file = sourceFileOf(localePath(lang, from), localeTexts[lang]);
    const place = locateInLocale(file, lang, from);
    if (!place.existing) continue;
    const localeName = place.existing.name;
    await writeFile(
      localePath(lang, from),
      localeTexts[lang].slice(0, localeName.getStart()) +
        newLeaf +
        localeTexts[lang].slice(localeName.getEnd()),
    );
    touched.add(localePath(lang, from));
  }
  console.log(`Renamed \`${from}\` to \`${to}\`. Update usages of \`t.${from}\` (typecheck will list them).`);
} else {
  fail(`Unknown command \`${command}\`. Run \`npm run i18n -- help\`.`);
}

const formatted = spawnSync('npx', ['prettier', '--write', ...touched], {
  stdio: 'ignore',
  cwd: resolve('.'),
});
if (formatted.status !== 0)
  console.warn('Note: prettier did not run cleanly; format the touched files manually.');
console.log(`Touched ${touched.size} files.`);
