import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(frontRoot, '../..');

export const kernelFrontSrc = resolve(frontRoot, 'src');
export const kernelBackSrc = resolve(repoRoot, 'kernel/back/src');
export const pluginSdkEntry = resolve(repoRoot, 'plugin-sdk/src/index.ts');

/** Vite/Vitest alias list. `@kernel/*` must precede `@/` so `@kernel/front` is not eaten. */
export const viteResolveAlias = [
  { find: '@tuucho/plugin-sdk', replacement: pluginSdkEntry },
  { find: '@kernel/front', replacement: kernelFrontSrc },
  { find: '@kernel/back', replacement: kernelBackSrc },
  { find: /^@\//, replacement: `${kernelFrontSrc}/` },
];

/** Absolute path for CSS module `composes: … from '…'`. Null = leave specifier to PostCSS. */
export function resolveCssComposeSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@kernel/front/')) {
    return resolve(kernelFrontSrc, spec.slice('@kernel/front/'.length));
  }
  if (spec.startsWith('@/')) {
    return resolve(kernelFrontSrc, spec.slice(2));
  }
  if (spec.startsWith('.')) {
    return resolve(dirname(fromFile), spec);
  }
  return null;
}
