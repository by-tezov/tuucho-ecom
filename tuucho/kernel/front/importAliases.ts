import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontRoot = dirname(fileURLToPath(import.meta.url));
const tuuchoRoot = resolve(frontRoot, '../..');
const repoRoot = resolve(frontRoot, '../../..');

export const kernelFrontSrc = resolve(frontRoot, 'src');
export const kernelBackSrc = resolve(tuuchoRoot, 'kernel/back/src');
export const pluginSdkEntry = resolve(tuuchoRoot, 'plugin-sdk/src/index.ts');
export const shopSrc = resolve(repoRoot, 'src');
export const pluginsBundledRoot = resolve(tuuchoRoot, 'plugins');
export const pluginsUserRoot = resolve(repoRoot, 'src/plugins');

/** Vite/Vitest alias list. `@kernel/*` and `@plugins-*` must precede `@/` so
 * `@kernel/front` and the plugin-tree glob prefixes are not eaten. Plugin
 * `import.meta.glob` literals use `@plugins-bundled` / `@plugins-user`:
 * relative `../` chains from `src/plugins/` used to escape the repo, so user
 * plugin fronts never loaded. */
export const viteResolveAlias = [
  { find: '@tuucho/plugin-sdk', replacement: pluginSdkEntry },
  { find: '@kernel/front', replacement: kernelFrontSrc },
  { find: '@kernel/back', replacement: kernelBackSrc },
  { find: '@plugins-bundled', replacement: pluginsBundledRoot },
  { find: '@plugins-user', replacement: pluginsUserRoot },
  { find: /^@shop\//, replacement: `${shopSrc}/` },
  { find: /^@\//, replacement: `${kernelFrontSrc}/` },
];

/** Absolute path for CSS module `composes: … from '…'`. Null = leave specifier to PostCSS. */
export function resolveCssComposeSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@kernel/front/')) {
    return resolve(kernelFrontSrc, spec.slice('@kernel/front/'.length));
  }
  if (spec.startsWith('@shop/')) {
    return resolve(shopSrc, spec.slice('@shop/'.length));
  }
  if (spec.startsWith('@/')) {
    return resolve(kernelFrontSrc, spec.slice(2));
  }
  if (spec.startsWith('.')) {
    return resolve(dirname(fromFile), spec);
  }
  return null;
}
