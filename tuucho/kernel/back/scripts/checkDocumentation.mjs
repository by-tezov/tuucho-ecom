import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const root = resolve('.');
const tuuchoRoot = resolve(root, '../..');
const repoRoot = resolve(tuuchoRoot, '..');
const docsRoot = resolve(tuuchoRoot, 'docs');
const commandDocsRoot = resolve(docsRoot, 'command');

async function walk(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path, extension) : extname(entry.name) === extension ? [path] : [];
    }),
  );
  return children.flat();
}

const markdownPaths = [
  ...(await walk(docsRoot, '.md')),
  resolve(root, 'README.md'),
  resolve(repoRoot, 'README.md'),
  ...['API.md', 'SCHEMA.md', 'COMMAND.md', 'CRON.md'].map((name) => resolve(tuuchoRoot, name)),
];
const markdown = new Map(
  await Promise.all(markdownPaths.map(async (path) => [path, await readFile(path, 'utf8')])),
);
const allDocumentation = [...markdown.values()].join('\n');
const commandDocumentation = [...markdown]
  .filter(([path]) => path.startsWith(`${commandDocsRoot}/`))
  .map(([, source]) => source)
  .join('\n');
const errors = [];

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const packageScripts = new Set(Object.keys(packageJson.scripts ?? {}));
// Front scripts are documented in the same tuucho/docs/command/ tree (05-front.md),
// and repository-root scripts in the root README and tuucho/docs, so a
// `npm run <script>` mention of either is not an unknown script.
for (const manifest of ['../front/package.json', '../../../package.json']) {
  try {
    const sibling = JSON.parse(await readFile(resolve(root, manifest), 'utf8'));
    for (const script of Object.keys(sibling.scripts ?? {})) packageScripts.add(script);
  } catch {
    // Sibling checkouts are optional.
  }
}
for (const script of Object.keys(packageJson.scripts ?? {})) {
  if (!commandDocumentation.includes(`npm run ${script}`)) {
    errors.push(`package script \`${script}\` is missing from tuucho/docs/command/.`);
  }
}

for (const match of allDocumentation.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
  if (!packageScripts.has(match[1]))
    errors.push(`documentation references unknown package script \`${match[1]}\`.`);
}

const scriptPaths = [
  ...(await walk(resolve(root, 'scripts'), '.ts')),
  ...(await walk(resolve(root, 'scripts'), '.mjs')),
];
const documentedFlags = new Set(
  [...commandDocumentation.matchAll(/--[a-z][a-z0-9-]*/g)].map((match) => match[0]),
);
for (const path of scriptPaths) {
  const source = await readFile(path, 'utf8');
  for (const declaration of source.matchAll(/\.(?:requiredOption|option)\(\s*['"`]([^'"`]+)/g)) {
    for (const flag of declaration[1].matchAll(/--[a-z][a-z0-9-]*/g)) {
      if (!documentedFlags.has(flag[0])) {
        errors.push(`${relative(root, path)} declares undocumented CLI flag \`${flag[0]}\`.`);
      }
    }
  }
}

for (const [path, source] of markdown) {
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    target = target.split(/\s+["']/)[0];
    if (!target || target.startsWith('#') || /^(?:https?:|mailto:)/i.test(target)) continue;
    const filePart = target.split('#')[0].split('?')[0];
    if (!filePart) continue;
    const absoluteTarget = resolve(dirname(path), decodeURIComponent(filePart));
    // Paths outside the repository (sibling checkouts, home) are optional.
    if (absoluteTarget !== repoRoot && !absoluteTarget.startsWith(`${repoRoot}${sep}`)) continue;
    try {
      await access(absoluteTarget);
    } catch {
      errors.push(`${relative(repoRoot, path)} links to missing \`${filePart}\`.`);
    }
  }
}

const featuresPath = resolve(docsRoot, 'features.json');
const frontRoot = resolve(root, '../front');
let features;
try {
  features = JSON.parse(await readFile(featuresPath, 'utf8'));
} catch {
  errors.push('tuucho/docs/features.json is missing or invalid JSON.');
  features = null;
}

async function pathExists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/** Top-level keys of the front's `Strings` interface, so a feature cannot
 * claim an i18n namespace that no longer exists. Absent in a standalone
 * backend checkout, in which case the namespace check is skipped. */
async function frontI18nNamespaces() {
  try {
    const source = await readFile(resolve(frontRoot, 'src/assets/i18n/types.ts'), 'utf8');
    const body = /export interface Strings \{([\s\S]*?)\n\}/.exec(source);
    if (!body) return null;
    return new Set(
      body[1]
        .split('\n')
        .filter((line) => /^ {2}[a-zA-Z]/.test(line))
        .map((line) => line.trim().split(/[?:]/)[0]),
    );
  } catch {
    return null;
  }
}

if (features && typeof features === 'object') {
  const namespaces = await frontI18nNamespaces();
  const frontAvailable = await pathExists(frontRoot);
  for (const [featureName, entry] of Object.entries(features)) {
    if (featureName.startsWith('$')) continue;
    if (!entry || typeof entry !== 'object') {
      errors.push(`tuucho/docs/features.json feature \`${featureName}\` must be an object.`);
      continue;
    }
    const requiredKeys = [
      'apiDoc',
      'schemaDoc',
      'module',
      'frontRoutes',
      'frontApi',
      'frontComponents',
      'i18n',
      'commands',
      'tests',
    ];
    for (const key of requiredKeys) {
      if (!(key in entry)) {
        errors.push(`tuucho/docs/features.json feature \`${featureName}\` is missing \`${key}\`.`);
      }
    }
    for (const key of ['apiDoc', 'schemaDoc', 'module']) {
      const rel = entry[key];
      if (typeof rel !== 'string' || !rel) {
        errors.push(`tuucho/docs/features.json feature \`${featureName}\`.${key} must be a non-empty string.`);
        continue;
      }
      // apiDoc/schemaDoc are relative to `tuucho/` (docs moved there);
      // module stays relative to this backend workspace.
      const base = key === 'module' ? root : tuuchoRoot;
      if (!(await pathExists(resolve(base, rel)))) {
        errors.push(`tuucho/docs/features.json feature \`${featureName}\`.${key} missing path \`${rel}\`.`);
      }
    }
    const frontLists = new Set(['frontRoutes', 'frontApi', 'frontComponents']);
    for (const listKey of ['frontRoutes', 'frontApi', 'frontComponents', 'tests']) {
      const list = entry[listKey];
      if (!Array.isArray(list)) {
        errors.push(`tuucho/docs/features.json feature \`${featureName}\`.${listKey} must be an array.`);
        continue;
      }
      // Sibling repositories are optional in a standalone backend checkout.
      if (frontLists.has(listKey) && !frontAvailable) continue;
      for (const rel of list) {
        if (typeof rel !== 'string' || !rel) {
          errors.push(`tuucho/docs/features.json feature \`${featureName}\`.${listKey} has a non-string entry.`);
          continue;
        }
        const base = frontLists.has(listKey) ? frontRoot : root;
        if (!(await pathExists(resolve(base, rel)))) {
          errors.push(
            `tuucho/docs/features.json feature \`${featureName}\`.${listKey} missing path \`${rel}\`.`,
          );
        }
      }
    }
    if (Array.isArray(entry.commands)) {
      for (const command of entry.commands) {
        if (!packageScripts.has(command)) {
          errors.push(
            `tuucho/docs/features.json feature \`${featureName}\`.commands names unknown package script \`${command}\`.`,
          );
        }
      }
    }
    if (Array.isArray(entry.i18n) && namespaces) {
      for (const namespace of entry.i18n) {
        if (!namespaces.has(namespace)) {
          errors.push(
            `tuucho/docs/features.json feature \`${featureName}\`.i18n names unknown Strings namespace \`${namespace}\`.`,
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  const uniqueErrors = [...new Set(errors)].sort();
  console.error(`Documentation check failed (${uniqueErrors.length}):`);
  for (const error of uniqueErrors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const featureCount = features
    ? Object.keys(features).filter((name) => !name.startsWith('$')).length
    : 0;
  console.log(
    `Documentation check passed for ${markdownPaths.length} Markdown files, ${packageScripts.size} package scripts, ${documentedFlags.size} documented CLI flags, and ${featureCount} features.json entries.`,
  );
}
