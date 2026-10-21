/**
 * ESM resolve hook: plugin files live outside kernel/back, so
 * Node would resolve express/pg from a second copy (or fail). Retry bare
 * specifiers as if the importer were the kernel app, so plugins share the
 * kernel's express instance.
 *
 * Also maps `@kernel/back/…` onto this package's `src/` (dev `.ts`, dist `.js`).
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kernelSrc = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const kernelApp = pathToFileURL(join(kernelSrc, 'app.ts')).href;

function isPluginImporter(parentURL) {
  if (!parentURL) return false;
  return parentURL.includes('/plugins/');
}

function isBare(specifier) {
  return (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !specifier.startsWith('node:') &&
    !specifier.startsWith('#') &&
    !specifier.startsWith('@kernel/') &&
    !specifier.startsWith('file:')
  );
}

function kernelBackFile(rest) {
  const stripped = rest.replace(/\.js$/, '');
  const candidates = [
    join(kernelSrc, rest),
    join(kernelSrc, `${stripped}.ts`),
    join(kernelSrc, `${stripped}.js`),
    join(kernelSrc, stripped, 'index.ts'),
    join(kernelSrc, stripped, 'index.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@kernel/back/')) {
    const file = kernelBackFile(specifier.slice('@kernel/back/'.length));
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  if (isPluginImporter(context.parentURL) && isBare(specifier)) {
    try {
      return await nextResolve(specifier, { ...context, parentURL: kernelApp });
    } catch {
      // Fall through to the original importer (root node_modules, etc.).
    }
  }
  return nextResolve(specifier, context);
}
