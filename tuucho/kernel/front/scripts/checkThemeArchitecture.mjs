import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = resolve(projectRoot, 'src');
const themeContractPath = resolve(sourceRoot, 'styles/theme.css');
const semanticToken = '--(?:color|border|shadow)-[a-z0-9-]+';
const declarationPattern = new RegExp(`(${semanticToken})\\s*:`, 'g');
const usagePattern = new RegExp(`var\\(\\s*(${semanticToken})`, 'g');

async function findCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findCssFiles(path);
      return entry.isFile() && entry.name.endsWith('.css') ? [path] : [];
    }),
  );
  return nested.flat();
}

/** Comments are prose, not CSS. A note explaining *why* a module picks one
 * token over another ("--color-bg, not --color-cream-bright: …") otherwise
 * reads as a declaration and fails the file for a token it never sets. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function matches(text, pattern) {
  return new Set([...stripComments(text).matchAll(pattern)].map((match) => match[1]));
}

async function findSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findSourceFiles(path);
      return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

const cssFiles = await findCssFiles(sourceRoot);
const contract = await readFile(themeContractPath, 'utf8');
const declaredByContract = matches(contract, declarationPattern);
const errors = [];

/* Any custom property, not only semantic ones: a typo such as `--bg-card`
 * for `--color-bg-card`, or a spacing scale that was never defined, resolves
 * to the property's initial value and fails silently (transparent background,
 * zero padding). A var() with a fallback is deliberate and stays allowed.
 * Properties may also be set from TSX inline styles (`'--x': value`). */
const anyDeclarationPattern = /(--[a-zA-Z0-9-]+)\s*:/g;
const anyUsageWithoutFallbackPattern = /var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g;
const tsDeclarationPattern = /['"`](--[a-zA-Z0-9-]+)['"`]\s*[:\]]|setProperty\(\s*['"`](--[a-zA-Z0-9-]+)/g;
const declaredAnywhere = new Set();
const cssSources = new Map();
for (const file of cssFiles) {
  const css = await readFile(file, 'utf8');
  cssSources.set(file, css);
  for (const token of matches(css, anyDeclarationPattern)) declaredAnywhere.add(token);
}
for (const file of await findSourceFiles(sourceRoot)) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(tsDeclarationPattern)) declaredAnywhere.add(match[1] ?? match[2]);
}
for (const [file, css] of cssSources) {
  for (const token of matches(css, anyUsageWithoutFallbackPattern)) {
    if (!declaredAnywhere.has(token)) {
      errors.push(`${relative(projectRoot, file)}: ${token} is used but never declared`);
    }
  }
}

for (const file of cssFiles) {
  const css = await readFile(file, 'utf8');
  const displayPath = relative(projectRoot, file);

  for (const token of matches(css, usagePattern)) {
    if (!declaredByContract.has(token)) {
      errors.push(`${displayPath}: ${token} is used but is not declared by src/styles/theme.css`);
    }
  }

  if (file !== themeContractPath) {
    for (const token of matches(css, declarationPattern)) {
      errors.push(`${displayPath}: ${token} must be declared in src/styles/theme.css`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Theme architecture check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Theme architecture check passed (${declaredByContract.size} semantic tokens).`);
}
