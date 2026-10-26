import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  kernelBackSrc,
  kernelFrontSrc,
  pluginsBundledRoot,
  pluginsUserRoot,
  pluginSdkEntry,
  resolveCssComposeSpecifier,
  viteResolveAlias,
} from '../../importAliases';

const here = dirname(fileURLToPath(import.meta.url));

describe('import aliases', () => {
  it('maps @kernel/front and @/ CSS composes onto kernel/front/src', () => {
    expect(
      resolveCssComposeSpecifier('/tmp/plugin.css', '@kernel/front/components/admin/AdminList.module.css'),
    ).toBe(resolve(kernelFrontSrc, 'components/admin/AdminList.module.css'));
    expect(resolveCssComposeSpecifier('/tmp/plugin.css', '@/components/ui/Typography.module.css')).toBe(
      resolve(kernelFrontSrc, 'components/ui/Typography.module.css'),
    );
  });

  it('keeps relative CSS composes rooted at the importer', () => {
    const from = resolve(here, 'dummy.module.css');
    expect(resolveCssComposeSpecifier(from, './Local.module.css')).toBe(resolve(here, 'Local.module.css'));
  });

  it('leaves bare package specifiers to PostCSS', () => {
    expect(resolveCssComposeSpecifier('/tmp/plugin.css', 'some-lib/styles.css')).toBeNull();
  });

  it('points @kernel/back at kernel/back/src', () => {
    expect(kernelBackSrc.endsWith('kernel/back/src')).toBe(true);
  });

  it('points @tuucho/plugin-sdk at plugin-sdk/src/index.ts', () => {
    expect(pluginSdkEntry.endsWith('plugin-sdk/src/index.ts')).toBe(true);
  });

  it('points @plugins-bundled and @plugins-user at the two plugin trees', () => {
    expect(pluginsBundledRoot.endsWith('tuucho/plugins')).toBe(true);
    expect(pluginsUserRoot.endsWith('src/plugins')).toBe(true);
  });

  it('orders the plugin aliases before the @/ catch-all', () => {
    const finds = viteResolveAlias.map((alias) => alias.find);
    const atSlash = finds.findIndex((find) => find instanceof RegExp && find.source === '^@\\/');
    expect(atSlash).toBeGreaterThan(-1);
    for (const name of ['@plugins-bundled', '@plugins-user']) {
      const index = finds.indexOf(name);
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(atSlash);
    }
  });
});
